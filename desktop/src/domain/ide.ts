export type IDESession = { url: string; folder: string };
export interface IDEAPI {
  status(): Promise<IDESession | null>;
  open(createProject?: boolean): Promise<IDESession | null>;
  importSnippet(source: string, filename: string): Promise<{ uri: string }>;
  bounds(
    value: { x: number; y: number; width: number; height: number } | null,
  ): Promise<void>;
  stop(): Promise<void>;
  newTerminal(): Promise<void>;
  revealExplorer(): Promise<void>;
  openWithMenu(position: { x: number; y: number }): Promise<void>;
}
