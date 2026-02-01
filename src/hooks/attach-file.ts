import { EditorView } from "@codemirror/view"
import { useAtomCallback } from "jotai/utils"
import React from "react"
import { fileCache } from "../components/file-preview"
import { githubRepoAtom, githubUserAtom } from "../global-state"
import { fs, writeFile } from "../utils/fs"
import { getRepoDir, gitAdd, gitCommit } from "../utils/git"

export const UPLOADS_DIR = "/uploads"

export function useAttachFile() {
  const getGitHubUser = useAtomCallback(React.useCallback((get) => get(githubUserAtom), []))
  const getGitHubRepo = useAtomCallback(React.useCallback((get) => get(githubRepoAtom), []))

  const attachFile = React.useCallback(
    async (file: File, view?: EditorView) => {
      if (!navigator.onLine) return

      const githubUser = getGitHubUser()
      const githubRepo = getGitHubRepo()

      if (!githubUser || !githubRepo || !view) return

      try {
        const id = Date.now().toString()
        const extension = file.name.split(".").pop()
        const name = file.name.replace(`.${extension}`, "")
        const path = `${UPLOADS_DIR}/${id}.${extension}`
        const arrayBuffer = await file.arrayBuffer()

        const repoDir = getRepoDir(githubRepo)

        try {
          await fs.promises.mkdir(`${repoDir}${UPLOADS_DIR}`)
        } catch {}

        writeFile({ path: `${repoDir}${path}`, content: arrayBuffer, githubUser, githubRepo })
          .then(async () => {
            const relativePath = path.replace(/^\//, "")
            await gitAdd(githubRepo, [relativePath])
            await gitCommit(githubRepo, `Update ${relativePath}`)
          })
          .catch((error) => {
            console.error(error)
          })

        fileCache.set(path, { file, url: URL.createObjectURL(file) })

        const { selection } = view.state
        const { from = 0, to = 0 } = selection.ranges[selection.mainIndex] ?? {}
        const selectedText = view.state.doc.sliceString(from, to)

        let markdown = `[${selectedText || name}](${path})`

        if (
          file.type.startsWith("image/") ||
          file.type.startsWith("video/") ||
          file.type.startsWith("audio/")
        ) {
          markdown = `!${markdown}`
        }

        let anchor: number | undefined
        let head: number | undefined

        if (selectedText) {
          anchor = from + markdown.length
        } else {
          anchor = from + markdown.indexOf("]")
          head = from + markdown.indexOf("[") + 1
        }

        view?.dispatch({
          changes: [{ from, to, insert: markdown }],
          selection: { anchor, head },
        })

        view.focus()
      } catch (error) {
        console.error(error)
      }
    },
    [getGitHubRepo, getGitHubUser],
  )

  return attachFile
}
