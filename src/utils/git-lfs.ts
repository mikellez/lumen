import micromatch from "micromatch"
import { GitHubRepository, GitHubUser } from "../schema"
import { fs } from "./fs"
import { getRepoDir } from "./git"

export async function isTrackedWithGitLfs(repo: GitHubRepository, path: string) {
  const repoDir = getRepoDir(repo)

  try {
    const gitAttributes = await fs.promises.readFile(`${repoDir}/.gitattributes`)

    const parsedGitAttributes = gitAttributes
      .toString()
      .split("\n")
      .reduce(
        (acc, line) => {
          if (line.startsWith("#")) {
            return acc
          }

          if (!line.trim()) {
            return acc
          }

          const [pattern, ...attrs] = line.split(" ")

          return [...acc, { pattern, attrs }]
        },
        [] as Array<{ pattern: string; attrs: string[] }>,
      )

    return parsedGitAttributes.some(({ pattern, attrs }) => {
      return (
        micromatch.isMatch(
          path.replace(repoDir, "").replace(/^\/*/, ""),
          pattern.replace(/^\//, ""),
        ) && attrs.includes("filter=lfs")
      )
    })
  } catch (error) {
    return false
  }
}

export async function resolveGitLfsPointer({
  file,
  githubUser,
  githubRepo,
}: {
  file: File
  githubUser: GitHubUser
  githubRepo: GitHubRepository
}) {
  const text = await file.text()

  const response = await fetch(
    `/git-lfs-file?repo=${githubRepo.owner}/${githubRepo.name}&pointer=${text}`,
    {
      headers: {
        Authorization: `Bearer ${githubUser.token}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error("Unable to resolve Git LFS pointer")
  }

  const url = await response.text()

  if (!url) {
    throw new Error("Unable to resolve Git LFS pointer")
  }

  return url
}

export async function createGitLfsPointer(content: ArrayBuffer) {
  const oid = await getOid(content)
  const size = content.byteLength

  return `version https://git-lfs.github.com/spec/v1
oid sha256:${oid}
size ${size}
`
}

export async function uploadToGitLfsServer({
  content,
  githubUser,
  githubRepo,
}: {
  content: ArrayBuffer
  githubUser: GitHubUser
  githubRepo: GitHubRepository
}) {
  const base64Content = Buffer.from(content).toString("base64")
  const oid = await getOid(content)
  const size = content.byteLength

  const response = await fetch(`/git-lfs-file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubUser.token}`,
    },
    body: JSON.stringify({
      repo: `${githubRepo.owner}/${githubRepo.name}`,
      content: base64Content,
      oid,
      size,
    }),
  })

  if (!response.ok) {
    throw new Error("Unable to upload file to Git LFS server")
  }
}

export async function getOid(content: ArrayBuffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", content)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  return hashHex
}
