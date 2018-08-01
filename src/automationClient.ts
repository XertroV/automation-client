import * as cluster from "cluster";
import * as stringify from "json-stringify-safe";
import * as p from "path";
import { Configuration } from "./configuration";
import { HandleCommand } from "./HandleCommand";
import { HandleEvent } from "./HandleEvent";
import { HandlerResult } from "./HandlerResult";
import {
    Ingester,
    IngesterBuilder,
} from "./ingesters";
import { registerApplicationEvents } from "./internal/env/applicationEvent";
import { ClusterMasterRequestProcessor } from "./internal/transport/cluster/ClusterMasterRequestProcessor";
import { startWorker } from "./internal/transport/cluster/ClusterWorkerRequestProcessor";
import { EventStoringAutomationEventListener } from "./internal/transport/EventStoringAutomationEventListener";
import { ExpressRequestProcessor } from "./internal/transport/express/ExpressRequestProcessor";
import { ExpressServer } from "./internal/transport/express/ExpressServer";
import { MetricEnabledAutomationEventListener } from "./internal/transport/MetricEnabledAutomationEventListener";
import {
    CommandIncoming,
    EventIncoming,
    RequestProcessor,
} from "./internal/transport/RequestProcessor";
import { showStartupMessages } from "./internal/transport/showStartupMessages";
import { DefaultWebSocketRequestProcessor } from "./internal/transport/websocket/DefaultWebSocketRequestProcessor";
import { prepareRegistration } from "./internal/transport/websocket/payloads";
import { WebSocketClient } from "./internal/transport/websocket/WebSocketClient";
import { WebSocketRequestProcessor } from "./internal/transport/websocket/WebSocketRequestProcessor";
import {
    addFileTransport,
    logger,
    setLogLevel,
} from "./internal/util/logger";
import { obfuscateJson } from "./internal/util/string";
import { AutomationServer } from "./server/AutomationServer";
import { BuildableAutomationServer } from "./server/BuildableAutomationServer";
import { Maker } from "./util/constructionUtils";
import { StatsdAutomationEventListener } from "./util/statsd";

export class AutomationClient implements RequestProcessor {

    public automations: BuildableAutomationServer;
    public webSocketClient: WebSocketClient;
    public httpServer: ExpressServer;
    public webSocketHandler: WebSocketRequestProcessor;
    public httpHandler: ExpressRequestProcessor;

    private defaultListeners = [
        new MetricEnabledAutomationEventListener(),
        new EventStoringAutomationEventListener(),
    ];

    constructor(public configuration: Configuration) {
        this.automations = new BuildableAutomationServer(configuration);
        (global as any).__runningAutomationClient = this as AutomationClient;
    }

    get automationServer(): AutomationServer {
        return this.automations;
    }

    public withCommandHandler(chm: Maker<HandleCommand>): AutomationClient {
        this.automations.registerCommandHandler(chm);
        return this;
    }

    public withEventHandler(event: Maker<HandleEvent<any>>): AutomationClient {
        this.automations.registerEventHandler(event);
        return this;
    }

    public withIngester(ingester: Ingester | string): AutomationClient {
        this.automations.registerIngester(ingester);
        return this;
    }

    public processCommand(command: CommandIncoming, callback?: (result: Promise<HandlerResult>) => void) {
        if (this.webSocketHandler) {
            return this.webSocketHandler.processCommand(command, callback);
        } else if (this.httpHandler) {
            return this.httpHandler.processCommand(command, callback);
        } else {
            throw new Error("No request processor available");
        }
    }

    public processEvent(event: EventIncoming, callback?: (results: Promise<HandlerResult[]>) => void) {
        if (this.webSocketHandler) {
            return this.webSocketHandler.processEvent(event, callback);
        } else if (this.httpHandler) {
            return this.httpHandler.processEvent(event, callback);
        } else {
            throw new Error("No request processor available");
        }
    }

    public run(): Promise<void> {
        this.configureLogging();
        this.configureStatsd();

        const clientSig = `${this.configuration.name}:${this.configuration.version}`;
        const clientConf = stringify(this.configuration, obfuscateJson);

        if (!this.configuration.cluster.enabled) {
            logger.info(`Starting Atomist automation client ${clientSig}`);
            logger.debug(`Using automation client configuration: ${clientConf}`);

            if (this.configuration.ws.enabled) {
                return Promise.all([
                    this.runWs(() => this.setupWebSocketRequestHandler()),
                    Promise.resolve(this.runHttp(() => this.setupExpressRequestHandler())),
                    this.setupApplicationEvents(),
                ])
                    .then(() => {
                        return this.printStartupMessage();
                    });
            } else {
                return Promise.all([
                    Promise.resolve(this.runHttp(() => this.setupExpressRequestHandler())),
                    this.setupApplicationEvents(),
                ])
                    .then(() => {
                        return this.printStartupMessage();
                    });
            }
        } else if (cluster.isMaster) {
            logger.info(`Starting Atomist automation client master ${clientSig}`);
            logger.debug(`Using automation client configuration: ${clientConf}`);

            this.webSocketHandler = this.setupWebSocketClusterRequestHandler();

            return (this.webSocketHandler as ClusterMasterRequestProcessor).run()
                .then(() => {
                    return Promise.all([
                        this.runWs(() => this.webSocketHandler),
                        Promise.resolve(this.runHttp(() => this.setupExpressRequestHandler())),
                        this.setupApplicationEvents(),
                    ])
                        .then(() => {
                            return this.printStartupMessage();
                        });
                });
        } else if (cluster.isWorker) {
            logger.info(`Starting Atomist automation client worker ${clientSig}`);
            return Promise.resolve(startWorker(this.automations, this.configuration,
                [...this.defaultListeners, ...this.configuration.listeners]))
                .then(() => {
                    return Promise.resolve();
                });
        }
    }

    private configureStatsd() {
        if (this.configuration.statsd.enabled === true) {
            this.defaultListeners.push(new StatsdAutomationEventListener(this.configuration));
        }
    }

    private configureLogging() {
        setLogLevel(this.configuration.logging.level);

        if (this.configuration.logging.file.enabled === true) {
            let filename = p.join(".", "log", `${this.configuration.name.replace(/^.*\//, "")}.log`);
            if (this.configuration.logging.file.name) {
                filename = this.configuration.logging.file.name;
            }
            addFileTransport(filename, this.configuration.logging.file.level || this.configuration.logging.level);
        }
    }

    private setupWebSocketClusterRequestHandler(): ClusterMasterRequestProcessor {
        return new ClusterMasterRequestProcessor(this.automations, this.configuration,
            [...this.defaultListeners, ...this.configuration.listeners],
            this.configuration.cluster.workers);
    }

    private setupWebSocketRequestHandler(): WebSocketRequestProcessor {
        return new DefaultWebSocketRequestProcessor(this.automations, this.configuration,
            [...this.defaultListeners, ...this.configuration.listeners]);
    }

    private setupApplicationEvents(): Promise<any> {
        if (this.configuration.applicationEvents.enabled) {
            if (this.configuration.applicationEvents.workspaceId) {
                return registerApplicationEvents(this.configuration.applicationEvents.workspaceId);
            } else if (this.configuration.applicationEvents.teamId) {
                return registerApplicationEvents(this.configuration.applicationEvents.teamId);
            } else if (this.configuration.workspaceIds.length > 0) {
                return registerApplicationEvents(this.configuration.workspaceIds[0]);
            }
        }
        return Promise.resolve();
    }

    private setupExpressRequestHandler(): ExpressRequestProcessor {
        return new ExpressRequestProcessor(this.automations, this.configuration,
            [...this.defaultListeners, ...this.configuration.listeners]);
    }

    private runWs(handlerMaker: () => WebSocketRequestProcessor): Promise<void> {

        const payloadOptions: any = {};
        if (this.configuration.ws && this.configuration.ws.compress) {
            payloadOptions.accept_encoding = "gzip";
        }
        this.webSocketHandler = handlerMaker();
        this.webSocketClient = new WebSocketClient(
            () => prepareRegistration(this.automations.automations,
                payloadOptions,
                this.configuration.metadata),
            this.configuration,
            this.webSocketHandler);
        return this.webSocketClient.start();
    }

    private runHttp(handlerMaker: () => ExpressRequestProcessor): Promise<void> {
        if (!this.configuration.http.enabled) {
            return;
        }

        this.httpHandler = handlerMaker();
        this.httpServer = new ExpressServer(
            this.automations,
            this.configuration,
            this.httpHandler);
        return Promise.resolve();
    }

    private printStartupMessage(): Promise<void> {
        return showStartupMessages(this.configuration, this.automations.automations);
    }
}

export function automationClient(configuration: Configuration): AutomationClient {
    const client = new AutomationClient(configuration);
    configuration.commands.forEach(c => {
        client.withCommandHandler(c);
    });
    configuration.events.forEach(e => {
        client.withEventHandler(e);
    });
    configuration.ingesters.forEach(e => {
        if (typeof e === "string") {
            client.withIngester(e as string);
        } else if ((e as any).build) {
            client.withIngester((e as IngesterBuilder).build());
        } else {
            client.withIngester(e as Ingester);
        }
    });
    return client;
}
