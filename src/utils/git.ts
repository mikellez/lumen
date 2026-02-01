import git from "isomorphic-git"
import http from "isomorphic-git/http/web"
import { GitHubRepository, GitHubUser } from "../schema"
import { fs } from "./fs"
import { startTimer } from "./timer"

export const REPO_DIR = "/repo"

const REPOS_BASE_DIR = "/repos"
const DEFAULT_BRANCH = "main"

export function getRepoDir(repo: GitHubRepository): string {
  const sanitizedOwner = repo.owner
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
  const sanitizedName = repo.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
  return `${REPOS_BASE_DIR}/${sanitizedOwner}/${sanitizedName}`
}

export async function isRepoCloned(repo: GitHubRepository): Promise<boolean> {
  const repoDir = getRepoDir(repo)
  try {
    const gitDir = await fs.promises.stat(`${repoDir}/.git`)
    return gitDir.isDirectory()
  } catch {
    return false
  }
}

export async function listCachedRepos(): Promise<GitHubRepository[]> {
  const repos: GitHubRepository[] = []
  try {
    const owners = await fs.promises.readdir(REPOS_BASE_DIR)
    for (const owner of owners) {
      try {
        const names = await fs.promises.readdir(`${REPOS_BASE_DIR}/${owner}`)
        for (const name of names) {
          try {
            const gitDir = await fs.promises.stat(`${REPOS_BASE_DIR}/${owner}/${name}/.git`)
            if (gitDir.isDirectory()) {
              repos.push({ owner, name })
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}
  return repos
}

async function ensureRepoDir(repoDir: string): Promise<void> {
  const segments = repoDir.split("/").filter(Boolean)
  let currentPath = ""
  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`
    try {
      await fs.promises.stat(currentPath)
    } catch {
      await fs.promises.mkdir(currentPath)
    }
  }
}

export async function gitClone(repo: GitHubRepository, user: GitHubUser) {
  const repoDir = getRepoDir(repo)

  await ensureRepoDir(repoDir)

  const options: Parameters<typeof git.clone>[0] = {
    fs,
    http,
    dir: repoDir,
    corsProxy: "/cors-proxy",
    url: `https://github.com/${repo.owner}/${repo.name}`,
    ref: DEFAULT_BRANCH,
    singleBranch: true,
    depth: 1,
    onMessage: (message) => console.debug("onMessage", message),
    onProgress: (progress) => console.debug("onProgress", progress),
    onAuth: () => ({ username: user.login, password: user.token }),
  }

  let stopTimer = startTimer(`git clone ${options.url} ${options.dir}`)
  await git.clone(options)
  stopTimer()

  stopTimer = startTimer(`git config user.name "${user.name}"`)
  await git.setConfig({ fs, dir: repoDir, path: "user.name", value: user.name })
  stopTimer()

  stopTimer = startTimer(`git config user.email "${user.email}"`)
  await git.setConfig({ fs, dir: repoDir, path: "user.email", value: user.email })
  stopTimer()
}

export async function gitPull(repo: GitHubRepository, user: GitHubUser) {
  const repoDir = getRepoDir(repo)

  const options: Parameters<typeof git.pull>[0] = {
    fs,
    http,
    dir: repoDir,
    singleBranch: true,
    onMessage: (message) => console.debug("onMessage", message),
    onProgress: (progress) => console.debug("onProgress", progress),
    onAuth: () => ({ username: user.login, password: user.token }),
  }

  const stopTimer = startTimer("git pull")
  await git.pull(options)
  stopTimer()
}

export async function gitPush(repo: GitHubRepository, user: GitHubUser) {
  const repoDir = getRepoDir(repo)

  const options: Parameters<typeof git.push>[0] = {
    fs,
    http,
    dir: repoDir,
    onMessage: (message) => console.debug("onMessage", message),
    onProgress: (progress) => console.debug("onProgress", progress),
    onAuth: () => ({ username: user.login, password: user.token }),
  }

  const stopTimer = startTimer("git push")
  await git.push(options)
  stopTimer()
}

export async function gitAdd(repo: GitHubRepository, filePaths: string[]) {
  const repoDir = getRepoDir(repo)

  const options: Parameters<typeof git.add>[0] = {
    fs,
    dir: repoDir,
    filepath: filePaths,
  }

  const stopTimer = startTimer(`git add ${filePaths.join(" ")}`)
  await git.add(options)
  stopTimer()
}

export async function gitRemove(repo: GitHubRepository, filePath: string) {
  const repoDir = getRepoDir(repo)

  const options: Parameters<typeof git.remove>[0] = {
    fs,
    dir: repoDir,
    filepath: filePath,
  }

  const stopTimer = startTimer(`git remove ${filePath}`)
  await git.remove(options)
  stopTimer()
}

export async function gitCommit(repo: GitHubRepository, message: string) {
  const repoDir = getRepoDir(repo)

  const options: Parameters<typeof git.commit>[0] = {
    fs,
    dir: repoDir,
    message,
  }

  const stopTimer = startTimer(`git commit -m "${message}"`)
  await git.commit(options)
  stopTimer()
}

export async function isRepoSynced(repo: GitHubRepository): Promise<boolean> {
  const repoDir = getRepoDir(repo)

  const latestLocalCommit = await git.resolveRef({
    fs,
    dir: repoDir,
    ref: `refs/heads/${DEFAULT_BRANCH}`,
  })

  const latestRemoteCommit = await git.resolveRef({
    fs,
    dir: repoDir,
    ref: `refs/remotes/origin/${DEFAULT_BRANCH}`,
  })

  return latestLocalCommit === latestRemoteCommit
}

export async function getRemoteOriginUrl(repo: GitHubRepository): Promise<string | undefined> {
  const repoDir = getRepoDir(repo)

  const remoteOriginUrl = await git.getConfig({
    fs,
    dir: repoDir,
    path: "remote.origin.url",
  })

  return remoteOriginUrl
}

export async function removeCachedRepo(repo: GitHubRepository): Promise<boolean> {
  const repoDir = getRepoDir(repo)
  try {
    const entries = await fs.promises.readdir(repoDir)
    for (const entry of entries) {
      await removeRecursive(`${repoDir}/${entry}`)
    }
    await fs.promises.rmdir(repoDir)
    return true
  } catch {
    return false
  }
}

async function removeRecursive(path: string): Promise<void> {
  try {
    const stat = await fs.promises.stat(path)
    if (stat.isDirectory()) {
      const entries = await fs.promises.readdir(path)
      for (const entry of entries) {
        await removeRecursive(`${path}/${entry}`)
      }
      await fs.promises.rmdir(path)
    } else {
      await fs.promises.unlink(path)
    }
  } catch {}
}

export async function getCachedRepoSize(repo: GitHubRepository): Promise<number> {
  const repoDir = getRepoDir(repo)
  try {
    return await calculateDirSize(repoDir)
  } catch {
    return 0
  }
}

async function calculateDirSize(dir: string): Promise<number> {
  let totalSize = 0
  try {
    const entries = await fs.promises.readdir(dir)
    for (const entry of entries) {
      const path = `${dir}/${entry}`
      const stat = await fs.promises.stat(path)
      if (stat.isDirectory()) {
        totalSize += await calculateDirSize(path)
      } else {
        totalSize += stat.size
      }
    }
  } catch {}
  return totalSize
}
