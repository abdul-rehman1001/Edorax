import "monaco-editor/languages/definitions/yaml/register";
import "monaco-editor/languages/definitions/css/register";
import "monaco-editor/languages/definitions/html/register";
import "monaco-editor/languages/definitions/shell/register";
import "monaco-editor/languages/definitions/python/register";
import "monaco-editor/languages/definitions/typescript/register";
import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/language/json/monaco.contribution";
import "monaco-editor/languages/definitions/markdown/register";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import type { CodeEditorProps } from "@buildment/learning-ui/blocks/exercises/CodeExerciseClient";
import type { ProjectEntry } from "../../domain/labs";
import { FileCode2, Folder, FolderPlus, FilePlus2, RefreshCw, Save, X } from "lucide-react";
self.MonacoEnvironment = {
  getWorker: (_id, label) => (label === "json" ? new JsonWorker() : new EditorWorker()),
};
export function ScriptEditor({ value, onChange, readOnly, filename, language }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const instance = monaco.editor.create(host.current, {
      value,
      language,
      readOnly,
      automaticLayout: true,
      editContext: false,
      minimap: { enabled: false },
      fontSize: 13,
      padding: { top: 18, bottom: 18 },
      lineHeight: 22,
      renderLineHighlight: "none",
      overviewRulerBorder: false,
      scrollBeyondLastLine: false,
      ariaLabel: `Code editor for ${filename}`,
      theme: matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "vs",
    });
    editor.current = instance;
    const subscription = instance.onDidChangeModelContent(() =>
      change.current(instance.getValue()),
    );
    return () => {
      subscription.dispose();
      instance.getModel()?.dispose();
      instance.dispose();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    if (editor.current && editor.current.getValue() !== value) editor.current.setValue(value);
  }, [value]);
  useEffect(() => {
    editor.current?.updateOptions({ readOnly });
  }, [readOnly]);
  return <div ref={host} className="h-full w-full min-h-[180px] min-w-0 overflow-hidden" />;
}

export function ProjectEditor({
  blockId,
  connected,
  fill = false,
  entryPath = "exercise.js",
  ...entry
}: CodeEditorProps & { blockId: string; connected: boolean; entryPath?: string; fill?: boolean }) {
  const api = window.buildment.labs;
  const [files, setFiles] = useState<ProjectEntry[]>([{ path: entryPath, kind: "file" }]);
  const [active, setActive] = useState(entryPath);
  const [tabs, setTabs] = useState([entryPath]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["src"]));
  const [creating, setCreating] = useState<"file" | "directory" | null>(null);
  const [newPath, setNewPath] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const content = active === entryPath ? entry.value : (drafts[active] ?? "");
  const dirty = saved[active] !== undefined && saved[active] !== content;
  async function refresh() {
    const entries = await api.listFiles(blockId);
    setFiles(
      entries.some((file) => file.path === entryPath)
        ? entries
        : [{ path: entryPath, kind: "file" }, ...entries],
    );
  }
  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setError(
        (error instanceof Error ? error.message : String(error)).replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          "",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (connected) void run(refresh);
  }, [connected, blockId]);
  async function open(path: string) {
    if (path !== entryPath && drafts[path] === undefined) {
      const value = await api.readProjectFile(blockId, path);
      setDrafts((drafts) => ({ ...drafts, [path]: value }));
      setSaved((saved) => ({ ...saved, [path]: value }));
    }
    setTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
    setActive(path);
  }
  const extension = active.split(".").pop() || "";
  const languages: Record<string, string> = {
    js: "javascript",
    cjs: "javascript",
    mjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    py: "python",
    html: "html",
    css: "css",
    sh: "shell",
    bash: "shell",
    json: "json",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
  };
  const language = active === entryPath ? entry.language : languages[extension] || "plaintext";
  const change = (value: string) =>
    active === entryPath
      ? entry.onChange(value)
      : setDrafts((drafts) => ({ ...drafts, [active]: value }));
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return (
    <div className={fill ? "h-full min-h-0 min-w-0" : "min-w-0"}>
      <div
        className={`grid min-w-0 grid-cols-[minmax(120px,26%)_minmax(0,1fr)] ${fill ? "h-full" : ""}`}
      >
        <aside
          aria-label="Project explorer"
          className="min-w-0 border-r border-border bg-muted/20 text-xs"
        >
          <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
            <span className="mr-auto font-semibold">Files</span>
            <button
              title="New file"
              aria-label="New file"
              disabled={!connected || busy}
              onClick={() => {
                setCreating("file");
                setNewPath("");
              }}
            >
              <FilePlus2 size={15} />
            </button>
            <button
              title="New folder"
              aria-label="New folder"
              disabled={!connected || busy}
              onClick={() => {
                setCreating("directory");
                setNewPath("");
              }}
            >
              <FolderPlus size={15} />
            </button>
            <button
              title="Refresh files"
              aria-label="Refresh files"
              disabled={!connected || busy}
              onClick={() => void run(refresh)}
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {creating && (
            <form
              className="space-y-2 p-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await api.createEntry(blockId, newPath, creating);
                  await refresh();
                  if (creating === "file") await open(newPath);
                  else setExpanded((expanded) => new Set([...expanded, newPath]));
                  setCreating(null);
                });
              }}
            >
              <input
                autoFocus
                aria-label={creating === "file" ? "New file path" : "New folder path"}
                value={newPath}
                onChange={(event) => setNewPath(event.target.value)}
                placeholder={creating === "file" ? "src/example.js" : "src"}
                className="w-full rounded border border-border bg-background p-1"
              />
              <button disabled={busy || !newPath.trim()} className="mr-2 underline">
                Create
              </button>
              <button type="button" onClick={() => setCreating(null)}>
                Cancel
              </button>
            </form>
          )}
          <div role="tree" aria-label="Project files" className="max-h-[410px] overflow-auto py-2">
            {sorted
              .filter((file) =>
                file.path
                  .split("/")
                  .slice(0, -1)
                  .every((_, index) =>
                    expanded.has(
                      file.path
                        .split("/")
                        .slice(0, index + 1)
                        .join("/"),
                    ),
                  ),
              )
              .map((file) => (
                <button
                  key={file.path}
                  role="treeitem"
                  aria-selected={active === file.path}
                  aria-expanded={file.kind === "directory" ? expanded.has(file.path) : undefined}
                  onClick={() =>
                    file.kind === "directory"
                      ? setExpanded((previous) => {
                          const next = new Set(previous);
                          if (next.has(file.path)) next.delete(file.path);
                          else next.add(file.path);
                          return next;
                        })
                      : void run(() => open(file.path))
                  }
                  title={file.path}
                  className={`flex w-full min-w-0 items-center gap-1 py-1.5 pr-2 text-left ${active === file.path ? "bg-muted" : "hover:bg-muted/60"}`}
                  style={{ paddingLeft: 8 + (file.path.split("/").length - 1) * 12 }}
                >
                  {file.kind === "directory" ? (
                    <Folder className="shrink-0" size={14} />
                  ) : (
                    <FileCode2 className="shrink-0" size={14} />
                  )}
                  <span className="truncate">{file.path.split("/").pop()}</span>
                </button>
              ))}
          </div>
          {!connected && (
            <p className="p-2 text-muted-foreground">
              Open a local folder or start Docker to browse project files.
            </p>
          )}
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div
            role="tablist"
            aria-label="Open files"
            className="flex min-w-0 overflow-x-auto border-b border-border bg-muted/20"
          >
            {tabs.map((path) => (
              <div
                key={path}
                className={`flex shrink-0 items-center border-r border-border ${active === path ? "bg-background" : ""}`}
              >
                <button
                  role="tab"
                  aria-selected={active === path}
                  className="px-4 py-3 text-xs"
                  onClick={() => setActive(path)}
                >
                  {path}
                  {saved[path] !== undefined &&
                  saved[path] !== (path === entryPath ? entry.value : drafts[path])
                    ? " •"
                    : ""}
                </button>
                {path !== entryPath && (
                  <button
                    aria-label={`Close ${path}`}
                    className="pr-2"
                    onClick={() => {
                      if (
                        saved[path] !== drafts[path] &&
                        !window.confirm("Close this file and discard unsaved edits?")
                      )
                        return;
                      setTabs((tabs) => tabs.filter((tab) => tab !== path));
                      setDrafts((drafts) => {
                        const next = { ...drafts };
                        delete next[path];
                        return next;
                      });
                      if (active === path) setActive(entryPath);
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className={`${fill ? "min-h-0 flex-1" : "h-[380px]"} min-w-0 overflow-hidden`}>
            <ScriptEditor
              key={active}
              value={content}
              onChange={change}
              filename={active === entryPath ? entry.filename : active}
              language={language}
              readOnly={entry.readOnly || busy}
            />
          </div>
          <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs">
            <span className="mr-auto truncate">
              {active}
              {dirty ? " · Unsaved" : ""}
            </span>
            <button
              disabled={!connected || busy || entry.readOnly}
              className="flex items-center gap-1 rounded border border-border px-2 py-1 disabled:opacity-40"
              onClick={() =>
                void run(async () => {
                  await api.saveProjectFile(blockId, active, content);
                  setSaved((saved) => ({ ...saved, [active]: content }));
                  await refresh();
                })
              }
            >
              <Save size={13} />
              Save file
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="border-t border-border p-3 text-xs text-red-600">
          {error}
        </p>
      )}
      {!blockId.startsWith("course:") && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Course checks submit exercise.js only. Other files are for local experimentation.
        </p>
      )}
    </div>
  );
}
