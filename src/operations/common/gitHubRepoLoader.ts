import { GitCommandGitProject } from "../../project/git/GitCommandGitProject";
import { GitProject } from "../../project/git/GitProject";
import { RepoId } from "./RepoId";
import { RepoLoader } from "./repoLoader";

/**
 * Materialize from github
 * @param token provider token
 * @return function to materialize repos
 * @constructor
 */
export function gitHubRepoLoader(token: string): RepoLoader<GitProject> {
    return (repoId: RepoId) => {
        return GitCommandGitProject.cloned(token, repoId.owner, repoId.repo);
    };
}
