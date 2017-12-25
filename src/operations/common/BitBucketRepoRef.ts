import { ActionResult, successOn } from "../../action/ActionResult";
import { logger } from "../../internal/util/logger";
import { Configurable } from "../../project/git/Configurable";
import { AbstractRepoRef } from "./AbstractRemoteRepoRef";
import { ProjectOperationCredentials } from "./ProjectOperationCredentials";

import axios from "axios";
import { encode } from "../../internal/util/base64";

export const BitBucketDotComBase = "https://bitbucket.org/api/2.0";

export interface BitBucketCredentials extends ProjectOperationCredentials {

    basic: boolean;
}

export function isBitBucketCredentials(o: any): o is BitBucketCredentials {
    const c = o as BitBucketCredentials;
    return c.basic !== undefined;
}

export class BitBucketRepoRef extends AbstractRepoRef {

    constructor(owner: string,
                repo: string,
                sha: string = "master",
                public apiBase = BitBucketDotComBase,
                path?: string) {
        super("bitbucket.org", owner, repo, sha, path);
    }

    public cloneUrl(creds: ProjectOperationCredentials) {
        if (!isBitBucketCredentials(creds)) {
            throw new Error("Not BitBucket credentials: " + JSON.stringify(creds));
        }
        return `https://${this.owner}:${creds.token}@${this.remoteBase}/${this.pathComponent}.git`;
    }

    public createRemote(creds: ProjectOperationCredentials, description: string, visibility): Promise<ActionResult<this>> {
        const url = `${this.apiBase}/repositories/${this.owner}/${this.repo}`;
        logger.debug(`Making request to '${url}' to create repo`);
        return axios.post(url, {
            scm: "git",
            is_private: visibility === "private",
        }, this.headers(creds))
            .then(axiosResponse => {
                return {
                    target: this,
                    success: true,
                    axiosResponse,
                };
            })
            .catch(err => {
                logger.error("Error attempting to create repository: " + err);
                return Promise.reject(err);
            });
    }

    public deleteRemote(creds: ProjectOperationCredentials): Promise<ActionResult<this>> {
        const url = `${this.apiBase}/repositories/${this.owner}/${this.repo}`;
        logger.debug(`Making request to '${url}' to create repo`);
        return axios.delete(url, this.headers(creds))
            .then(axiosResponse => {
                return {
                    target: this,
                    success: true,
                    axiosResponse,
                };
            })
            .catch(err => {
                logger.error("Error attempting to delete repository: " + err);
                return Promise.reject(err);
            });
    }

    public setUserConfig(credentials: ProjectOperationCredentials, project: Configurable): Promise<ActionResult<any>> {
        return Promise.resolve(successOn(this));
    }

    public raisePullRequest(credentials: ProjectOperationCredentials,
                            title: string, body: string, head: string, base: string): Promise<ActionResult<this>> {
        const url = `${this.apiBase}/repositories/${this.owner}/${this.repo}/pullrequests`;
        logger.debug(`Making request to '${url}' to raise PR`);
        return axios.post(url, {
            title,
            description: body,
            source: {
                branch: {
                    name: head,
                },
            },
            destination: {
                branch: {
                    name: base,
                },
            },
        }, this.headers(credentials))
            .then(axiosResponse => {
                return {
                    target: this,
                    success: true,
                    axiosResponse,
                };
            })
            .catch(err => {
                logger.error("Error attempting to raise PR: " + err);
                return Promise.reject(err);
            });
    }

    private headers(credentials: ProjectOperationCredentials) {
        const upwd = `${this.owner}:${credentials.token}`;
        const encoded = encode(upwd);
        return {
            headers: {
                Authorization: `Basic ${encoded}`,
            },
        };
    }

}
