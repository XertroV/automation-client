function barf(): string {
    throw new Error("<please set GITHUB_TOKEN env variable>");
}

export const GitHubToken = process.env.GITHUB_TOKEN || barf();
