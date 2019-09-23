import { AbstractScriptedFlushable } from "../../internal/common/AbstractScriptedFlushable";
import { RepoRef } from "../../operations/common/RepoId";
import { logger } from "../../util/logger";
import {
    File,
    FileNonBlocking,
} from "../File";
import {
    DefaultExcludes,
    DefaultFiles,
} from "../fileGlobs";
import {
    FileStream,
    Project,
} from "../Project";
import * as _ from "lodash";

import * as minimatch from "minimatch";

/**
 * Support for implementations of Project interface
 */
export abstract class AbstractProject extends AbstractScriptedFlushable<Project> implements Project {

    /**
     * Cached paths
     */
    private cachedFiles: File[];

    get name(): string {
        return !!this.id ? this.id.repo : undefined;
    }

    protected constructor(public id: RepoRef) {
        super();
    }

    /**
     * Return the file, or reject with error
     * @param {string} path
     * @return {Promise<File>}
     */
    public abstract findFile(path: string): Promise<File>;

    public abstract getFile(path: string): Promise<File | undefined>;

    public async hasFile(path: string): Promise<boolean> {
        return !!(await this.getFile(path));
    }

    public abstract hasDirectory(path: string): Promise<boolean>;

    public abstract findFileSync(path: string): File;

    public streamFiles(...globPatterns: string[]): FileStream {
        const globsToUse = globPatterns.length > 0 ? globPatterns.concat(DefaultExcludes) : DefaultFiles;
        return this.streamFilesRaw(globsToUse, {});
    }

    public abstract streamFilesRaw(globPatterns: string[], opts: {}): FileStream;

    /**
     * Get files matching these patterns
     * @param {string[]} globPatterns
     * @return {Promise<File[]>}
     */
    public async getFiles(globPatterns: string | string[] = []): Promise<File[]> {
        const globPatternsToUse = globPatterns ?
            (typeof globPatterns === "string" ? [globPatterns] : globPatterns) :
            [];
        if (this.cachedFiles) {
            return this.cachedFiles;
        }
        this.cachedFiles = [];
        await new Promise((resolve, reject) => {
            this.streamFiles()
                .on("data", f => this.cachedFiles.push(f))
                .on("error", reject)
                .on("end", _ => resolve(this.cachedFiles));
        });
        return globPatterns ?
            globMatchesWithin(this.cachedFiles, globPatternsToUse) :
            this.cachedFiles;
    }

    public async totalFileCount(): Promise<number> {
        const files = await this.getFiles();
        return files.length;
    }

    public trackFile(f: FileNonBlocking): this {
        logger.debug(`Project is tracking '${f.path}'`);
        return this.recordAction(p => {
            return f.flush().then(_ => p);
        });
    }

    public moveFile(oldPath: string, newPath: string): Promise<this> {
        return this.findFile(oldPath)
            .then(f =>
                f.setPath(newPath).then(() => this),
            )
            // Not an error if no such file
            .catch(err => this);
    }

    public abstract makeExecutable(path: string): Promise<this>;

    public recordAddFile(path: string, content: string): this {
        return this.recordAction(p => p.addFile(path, content));
    }

    public recordDeleteFile(path: string): this {
        return this.recordAction(p => p.deleteFile(path));
    }

    public abstract addFileSync(path: string, content: string): void;

    public abstract deleteDirectorySync(path: string): void;

    public abstract deleteDirectory(path: string): Promise<this>;

    // TODO set permissions
    public add(f: File): Promise<this> {
        return f.getContent()
            .then(content => this.addFile(f.path, content));
    }

    public abstract addFile(path: string, content: string): Promise<this>;

    public abstract addDirectory(path: string): Promise<this>;

    public abstract deleteFile(path: string): Promise<this>;

    public abstract deleteFileSync(path: string): void;

    public abstract makeExecutableSync(path: string): void;

    public abstract directoryExistsSync(path: string): boolean;

    public abstract fileExistsSync(path: string): boolean;

    protected invalidateCache(): void {
        this.cachedFiles = undefined;
    }

}

export function globMatchesWithin(files: File[], globPatterns: string[]): File[] {
    const positiveMatches = _.flatten(
        files.filter(f =>
            globPatterns.some(gp => !gp.startsWith("!") && minimatch.match([f.path], gp).includes(f.path)),
        ));
    const matchingFiles = _.reject(positiveMatches,
        f => globPatterns.some(gp => gp.startsWith("!") && minimatch.match([f.path], gp.substring(1)).includes(f.path)),
    );
    return matchingFiles;
}
