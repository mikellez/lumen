import LightningFS from "@isomorphic-git/lightning-fs"
import mime from "mime"
import { GitHubRepository, GitHubUser } from "../schema"
import {
  createGitLfsPointer,
  isTrackedWithGitLfs,
  resolveGitLfsPointer,
  uploadToGitLfsServer,
} from "./git-lfs"

const DB_NAME = "fs"

export const fs = new LightningFS(DB_NAME)

/** Delete file system database */
export function fsWipe() {
  window.indexedDB.deleteDatabase(DB_NAME)
}

/**
 * The same as fs.promises.readFile(),
 * but it returns a File object instead of string or Uint8Array
 */
export async function readFile(path: string) {
  let content = await fs.promises.readFile(path)

  // If content is a string, convert it to a Uint8Array
  if (typeof content === "string") {
    content = new TextEncoder().encode(content)
  }

  const mimeType = mime.getType(path) ?? ""
  const filename = path.split("/").pop() ?? ""
  return new File([content as BlobPart], filename, { type: mimeType })
}

/** Returns a URL to the given file */
export async function getFileUrl({
  file,
  path,
  githubUser,
  githubRepo,
}: {
  file: File
  path: string
  githubUser: GitHubUser
  githubRepo: GitHubRepository
}) {
  if (await isTrackedWithGitLfs(githubRepo, path)) {
    return await resolveGitLfsPointer({ file, githubUser, githubRepo })
  } else {
    return URL.createObjectURL(file)
  }
}

/** Write a file to the file system and handle Git LFS automatically if needed */
export async function writeFile({
  path,
  content,
  githubUser,
  githubRepo,
}: {
  path: string
  content: ArrayBuffer
  githubUser: GitHubUser
  githubRepo: GitHubRepository
}) {
  if (await isTrackedWithGitLfs(githubRepo, path)) {
    await uploadToGitLfsServer({ content, githubUser, githubRepo })

    const pointer = await createGitLfsPointer(content)
    await fs.promises.writeFile(path, pointer)
  } else {
    await fs.promises.writeFile(path, Buffer.from(content))
  }
}

export async function fsDebug(fs: LightningFS, dir = "/") {
  try {
    const files = await fs.promises.readdir(dir)

    console.log(`Contents of ${dir}:`, files)

    for (const file of files) {
      const filePath = `${dir}/${file}`

      const stats = await fs.promises.stat(filePath)
      if (stats.isDirectory()) {
        await fsDebug(fs, `${filePath}/`)
      } else {
        const content = await fs.promises.readFile(filePath, "utf8")
        console.log(`Contents of ${filePath}:`, content)
      }
    }
  } catch (error) {
    console.error("Error logging file system state:", error)
  }
}
