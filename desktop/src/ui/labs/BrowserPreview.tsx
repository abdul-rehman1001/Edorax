import { useState } from "react";
import { Globe, ArrowLeft, ArrowRight, RotateCw, ArrowUpRight } from "lucide-react";
export function previewURL(value: string) {
  const url = new URL(value.includes("://") ? value : `http://${value}`);
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    )
  )
    throw new Error("Use an HTTPS website or a local development server.");
  return url.href;
}
export function BrowserPreview() {
  const [address, setAddress] = useState("http://localhost:3000");
  const [history, setHistory] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const url = history[index];
  const move = (next: number) => {
    setIndex(next);
    setAddress(history[next]);
  };
  return (
    <section aria-label="Browser preview" className="min-h-[460px] bg-background">
      <form
        className="flex items-center gap-1 border-b border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const next = previewURL(address);
            setHistory([...history.slice(0, index + 1), next]);
            setIndex(index + 1);
            setAddress(next);
            setError("");
          } catch (error) {
            setError(String(error));
          }
        }}
      >
        <button
          type="button"
          aria-label="Previous preview address"
          disabled={index < 1}
          onClick={() => move(index - 1)}
          className="rounded-full p-2 hover:bg-muted disabled:opacity-30"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          aria-label="Next preview address"
          disabled={index >= history.length - 1}
          onClick={() => move(index + 1)}
          className="rounded-full p-2 hover:bg-muted disabled:opacity-30"
        >
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          aria-label="Reload preview"
          onClick={() => setRevision((n) => n + 1)}
          className="rounded-full p-2 hover:bg-muted"
        >
          <RotateCw size={16} />
        </button>
        <input
          aria-label="Preview URL"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          className="min-w-0 flex-1 rounded-full border border-border bg-muted/40 px-4 py-2 text-sm"
        />
        <button aria-label="Open preview" className="rounded-full p-2 hover:bg-muted">
          <ArrowUpRight size={17} />
        </button>
      </form>
      {error && (
        <p role="alert" className="p-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {url ? (
        <>
          <iframe
            key={`${url}:${revision}`}
            title="Project browser preview"
            src={url}
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            className="h-[480px] w-full border-0 bg-white"
          />
          <p className="px-4 py-2 text-xs text-muted-foreground">
            Some websites block embedded previews. Preview runs without access to your project files
            or Edorax account.
          </p>
        </>
      ) : (
        <div className="flex min-h-[390px] flex-col items-center justify-center px-10 text-center">
          <Globe size={32} className="mb-4 text-muted-foreground" />
          <h3 className="text-xl font-medium tracking-tight">Your project, live</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Start a development server in the local terminal, then enter its localhost address
            above. You can also preview HTTPS pages that allow embedding.
          </p>
        </div>
      )}
    </section>
  );
}
