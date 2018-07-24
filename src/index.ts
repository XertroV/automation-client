export {
    Configuration,
    configurationValue,
} from "./configuration";

export {
    CommandHandler,
    ConfigurableCommandHandler,
    EventHandler,
    MappedParameter,
    MappedParameters,
    Parameter,
    Parameters,
    Secret,
    Secrets,
    Value,
    Tags,
} from "./decorators";

export { HandleCommand } from "./HandleCommand";

export {
    EventFired,
    HandleEvent,
} from "./HandleEvent";

export {
    AutomationContextAware,
    ConfigurationAware,
    HandlerContext,
    HandlerLifecycle,
} from "./HandlerContext";

export {
    failure,
    Failure,
    FailurePromise,
    HandlerError,
    HandlerResult,
    RedirectResult,
    reduceResults,
    success,
    Success,
    SuccessPromise,
} from "./HandlerResult";

import * as GraphQL from "./graph/graphQL";

export { GraphQL };

export { logger } from "./internal/util/logger";

export {
    buildEnum,
    buildIngester,
    buildType,
    IngesterBuilder,
} from "./ingesters";

export { AutomationEventListener } from "./server/AutomationEventListener";

export {
    AtomistBuild,
    AtomistLinkImage,
    AtomistWebhookType,
    postAtomistWebhook,
} from "./atomistWebhook";

export { automationClientInstance } from "./globals";
