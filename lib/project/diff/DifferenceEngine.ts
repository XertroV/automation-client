import * as _ from "lodash";

import { GitHubRepoRef } from "../../operations/common/GitHubRepoRef";
import { RepoRef } from "../../operations/common/RepoId";
import { GitCommandGitProject } from "../git/GitCommandGitProject";
import { GitProject } from "../git/GitProject";

import { Chain } from "./Chain";

/**
 * Extracts fingerprints, diffs them, and invokes actions on Github shas that are being compared
 */
export class DifferenceEngine {

    constructor(private readonly githubIssueAuth: GithubIssueAuth, private readonly chains: Array<Chain<any, any>>) {
    }

    /**
     * Run configured diff chains for these shas
     * @param baseSha
     * @param headSha
     */
    public run(baseSha: string, headSha: string) {
        const baseProjectPromise = this.cloneRepo(this.githubIssueAuth, baseSha);
        baseProjectPromise.then(project => {
            const baseFingerprintPromises: Array<Promise<any>> = _.map(this.chains, c => c.extractor.extract(project));
            Promise.all(baseFingerprintPromises).then(baseFps => {
                const headProjectCheckout = project.checkout(headSha);
                headProjectCheckout.then(headProjectCheckoutSuccess => {
                    const headFingerprintPromises: Array<Promise<any>> =
                        _.map(this.chains, c => c.extractor.extract(project));
                    Promise.all(headFingerprintPromises).then(headFps => {
                        const diffs = this.chains.map((c, i) => c.differ.diff(baseFps[i], headFps[i]));
                        diffs.map((d, i) => this.chains[i].actions.forEach(a => a.invoke(baseFps[i], headFps[i], d)));
                    });
                });
            });
        });
    }

    private cloneRepo(githubIssueAuth: GithubIssueAuth, sha: string): Promise<GitProject> {
        return GitCommandGitProject.cloned(
            { token: githubIssueAuth.githubToken },
            new GitHubRepoRef(githubIssueAuth.owner, githubIssueAuth.repo, githubIssueAuth.sha));
    }
}

/**
 * Details that allow a GitHub issue to be referenced and modified
 */
export interface GithubIssueAuth extends RepoRef {
    githubToken: string;
    issueNumber: number;
}
