import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useState, useEffect } from "react"
import { useNetworkState } from "react-use"
import { Button } from "../components/button"
import { useSignOut } from "../components/github-auth"
import { GitHubAvatar } from "../components/github-avatar"
import { LoadingIcon16, SettingsIcon16 } from "../components/icons"
import { OpenAIKeyInput } from "../components/openai-key-input"
import { PageLayout } from "../components/page-layout"
import { RepoForm } from "../components/repo-form"
import { Signature } from "../components/signature"
import { Switch } from "../components/switch"
import {
  epaperAtom,
  githubRepoAtom,
  githubUserAtom,
  globalStateMachineAtom,
  hasOpenAIKeyAtom,
  isCloningRepoAtom,
  isRepoClonedAtom,
  isRepoNotClonedAtom,
  vimModeAtom,
  voiceAssistantEnabledAtom,
} from "../global-state"
import { cx } from "../utils/cx"
import { getCachedRepoSize, listCachedRepos, removeCachedRepo } from "../utils/git"

export const Route = createFileRoute("/_appRoot/settings")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Settings · Lumen" }],
  }),
})

function RouteComponent() {
  return (
    <PageLayout title="Settings" icon={<SettingsIcon16 />} disableGuard>
      <div className="p-4 pb-6">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <GitHubSection />
          <AppearanceSection />
          <EditorSection />
          <AISection />
          <div className="p-5 text-text-tertiary self-center flex flex-col gap-3 items-center">
            <span className="text-sm">
              Made by{" "}
              <a
                className="link decoration-text-tertiary"
                href="https://colebemis.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cole Bemis
              </a>{" "}
              &{" "}
              <a
                className="link decoration-text-tertiary"
                href="https://github.com/lumen-notes/lumen/graphs/contributors"
                target="_blank"
                rel="noopener noreferrer"
              >
                friends
              </a>
            </span>
            <a href="https://colebemis.com" target="_blank" rel="noopener noreferrer">
              <Signature width={100} />
            </a>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-bold leading-4">{title}</h3>
      <div className="card-1 p-4">{children}</div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function GitHubSection() {
  const navigate = useNavigate()
  const githubUser = useAtomValue(githubUserAtom)
  const githubRepo = useAtomValue(githubRepoAtom)
  const isRepoNotCloned = useAtomValue(isRepoNotClonedAtom)
  const isCloningRepo = useAtomValue(isCloningRepoAtom)
  const isRepoCloned = useAtomValue(isRepoClonedAtom)
  const send = useSetAtom(globalStateMachineAtom)
  const signOut = useSignOut()
  const { online } = useNetworkState()
  const [isEditingRepo, setIsEditingRepo] = useState(false)
  const [cachedRepos, setCachedRepos] = useState<{ owner: string; name: string }[]>([])
  const [repoSizes, setRepoSizes] = useState<Record<string, number>>({})

  useEffect(() => {
    if (githubUser) {
      listCachedRepos().then((repos) => {
        setCachedRepos(repos)
        repos.forEach((repo) => {
          getCachedRepoSize(repo).then((size) => {
            setRepoSizes((prev) => ({ ...prev, [`${repo.owner}/${repo.name}`]: size }))
          })
        })
      })
    }
  }, [githubUser, githubRepo])

  const handleRemoveRepo = async (repo: { owner: string; name: string }, e: React.MouseEvent) => {
    e.stopPropagation()
    if (
      confirm(
        `Remove cached copy of ${repo.owner}/${repo.name}? This will delete the local copy but not affect the remote repository.`,
      )
    ) {
      await removeCachedRepo(repo)
      setCachedRepos((prev) => prev.filter((r) => r.owner !== repo.owner || r.name !== repo.name))
      setRepoSizes((prev) => {
        const next = { ...prev }
        delete next[`${repo.owner}/${repo.name}`]
        return next
      })
    }
  }

  if (!githubUser) {
    return (
      <SettingsSection title="GitHub">
        <div className="text-text-secondary">You're not signed in.</div>
      </SettingsSection>
    )
  }

  const otherCachedRepos = cachedRepos.filter(
    (repo) => repo.owner !== githubRepo?.owner || repo.name !== githubRepo?.name,
  )

  const totalCachedSize = Object.values(repoSizes).reduce((sum, size) => sum + size, 0)

  return (
    <SettingsSection title="GitHub">
      <div className="flex items-center justify-between gap-4">
        <div className="flex w-0 grow flex-col gap-1">
          <span className="text-sm leading-4 text-text-secondary">Account</span>
          <span className="flex items-center gap-2 leading-4">
            {online ? <GitHubAvatar login={githubUser.login} size={16} /> : null}
            <span className="truncate">{githubUser.login}</span>
          </span>
        </div>
        <Button
          className="shrink-0"
          onClick={() => {
            signOut()
            navigate({ to: "/", search: { query: undefined, view: "grid" } })
          }}
        >
          Sign out
        </Button>
      </div>
      <div className="mt-4 border-t border-border-secondary pt-4 empty:hidden">
        {isRepoNotCloned || isEditingRepo ? (
          <RepoForm
            onSubmit={() => setIsEditingRepo(false)}
            onCancel={!isRepoNotCloned ? () => setIsEditingRepo(false) : undefined}
          />
        ) : null}
        {isCloningRepo && githubRepo ? (
          <div className="flex items-center gap-2 leading-4 text-text-secondary">
            <LoadingIcon16 />
            Switching to {githubRepo.owner}/{githubRepo.name}…
          </div>
        ) : null}
        {isRepoCloned && !isEditingRepo && githubRepo ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex w-0 grow flex-col items-start gap-1">
                <span className="text-sm leading-4 text-text-secondary">Repository</span>
                <a
                  href={`https://github.com/${githubRepo.owner}/${githubRepo.name}`}
                  className="link leading-5"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {githubRepo.owner}/{githubRepo.name}
                </a>
              </div>
              <Button className="shrink-0" onClick={() => setIsEditingRepo(true)}>
                Connect other
              </Button>
            </div>

            {otherCachedRepos.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm leading-4 text-text-secondary">
                    Cached repositories ({otherCachedRepos.length})
                  </span>
                  {totalCachedSize > 0 && (
                    <span className="text-xs text-text-tertiary">
                      Total: {formatBytes(totalCachedSize)}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {otherCachedRepos.map((repo) => (
                    <div
                      key={`${repo.owner}/${repo.name}`}
                      className="group flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary"
                    >
                      <button
                        onClick={() => send({ type: "SELECT_REPO", githubRepo: repo })}
                        className="flex w-0 grow items-center justify-between gap-2 text-left"
                      >
                        <span className="truncate">
                          {repo.owner}/{repo.name}
                        </span>
                        <span className="text-xs text-text-tertiary shrink-0">
                          {repoSizes[`${repo.owner}/${repo.name}`]
                            ? formatBytes(repoSizes[`${repo.owner}/${repo.name}`])
                            : "..."}
                        </span>
                      </button>
                      <button
                        onClick={(e) => handleRemoveRepo(repo, e)}
                        className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text-danger px-2"
                        title="Remove cached copy"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </SettingsSection>
  )
}

function AppearanceSection() {
  const [epaper, setEpaper] = useAtom(epaperAtom)

  return (
    <SettingsSection title="Appearance">
      <div className="flex items-center gap-2.5 leading-4">
        <Switch id="epaper" checked={epaper} onCheckedChange={setEpaper} />
        <label htmlFor="epaper" className="select-none">
          E-paper
        </label>
      </div>
    </SettingsSection>
  )
}

function EditorSection() {
  const [vimMode, setVimMode] = useAtom(vimModeAtom)

  return (
    <SettingsSection title="Editor">
      <div className="flex items-center gap-2.5 leading-4">
        <Switch id="vim-mode" checked={vimMode} onCheckedChange={setVimMode} />
        <label htmlFor="vim-mode" className="select-none">
          Vim mode
        </label>
      </div>
    </SettingsSection>
  )
}

function AISection() {
  const hasOpenAIKey = useAtomValue(hasOpenAIKeyAtom)
  const [voiceAssistantEnabled, setVoiceAssistantEnabled] = useAtom(voiceAssistantEnabledAtom)

  return (
    <SettingsSection title="AI">
      <div className="flex flex-col gap-4">
        <OpenAIKeyInput />
        <div role="separator" className="h-px bg-border-secondary" />
        <div className="flex flex-col gap-3 leading-4 coarse:gap-4">
          <div className="flex items-start gap-2.5">
            <Switch
              id="voice-assistant"
              disabled={!hasOpenAIKey}
              checked={hasOpenAIKey && voiceAssistantEnabled}
              onCheckedChange={(checked) => setVoiceAssistantEnabled(checked)}
            />
            <div className="flex flex-col gap-2 leading-4 coarse:leading-5">
              <label
                htmlFor="voice-assistant"
                className={cx(
                  "select-none",
                  !hasOpenAIKey && "cursor-not-allowed text-text-secondary",
                )}
              >
                Voice assistant <span className="italic text-text-secondary">(beta)</span>
              </label>
              <Link
                to="/notes/$"
                params={{ _splat: ".lumen/voice-instructions" }}
                search={{ mode: "write", query: undefined, view: "grid" }}
                className="link text-text-secondary"
              >
                Custom instructions
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  )
}
