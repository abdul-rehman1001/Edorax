import type { MDXComponents } from "next-mdx-remote-client/rsc";
import { QuizComponent } from "@/blocks/quiz/Component";
import { PredictComponent } from "@/blocks/predict/Component";
import { AiInterviewComponent } from "@/blocks/ai-interview/Component";
import { OpenQuestionComponent } from "@/blocks/open-question/Component";
import { CodeExerciseComponent } from "@/blocks/code/Component";
import { StepsComponent } from "@/blocks/steps/Component";
import { ProjectPreviewComponent } from "@/blocks/project-preview/Component";
import { LearningObjectivesComponent } from "@/blocks/learning-objectives/Component";
import { ChapterRecapComponent } from "@/blocks/chapter-recap/Component";
import { MustReadComponent } from "@/blocks/must-read/Component";
import { MandatoryReadCard } from "@/components/learn/mandatory-read-card";
import { VideoComponent } from "@/blocks/video/Component";
import { VisualWalkthroughComponent } from "@/blocks/visual-walkthrough/Component";
import { VisualDiagramComponent } from "@/blocks/visual-diagram/Component";
import { RoadmapComponent } from "@/blocks/roadmap/Component";
import { MermaidDiagram } from "@buildment/learning-ui/components/learn/mermaid-diagram";
import { EcosystemGallery } from "@/components/learn/ecosystem-gallery";
import { Checklist } from "@/components/learn/checklist";
import { LearningLog } from "@/components/learn/learning-log";
import { cn } from "@/lib/utils";
import { slugify } from "@/shared/lib/mdx-headings";
import { MdxCodeElement, MdxCodeFigure, MdxCodePre } from "@/mdx/code-block";
import { HeadingNoteButton } from "@/components/learn/heading-note";
import { sharedLessonBlocks } from "@buildment/learning-ui/lesson-blocks";
import { ChapterRefChildren } from "@buildment/learning-ui/components/learn/chapter-refs";

const cellBorder = "border border-border";

// The allowlisted component map for the reader route — see
// docs/02-content-authoring.mdx "Rendering pipeline": only components in this
// map are reachable from compiled MDX, so a compromised/careless mentor
// account can add prose, not arbitrary JS.
export const mdxComponents: MDXComponents = {
  ...sharedLessonBlocks,
  Quiz: QuizComponent,
  Predict: PredictComponent,
  AiInterview: AiInterviewComponent,
  OpenQuestion: OpenQuestionComponent,
  CodeExercise: CodeExerciseComponent,
  Steps: StepsComponent,
  ProjectPreview: ProjectPreviewComponent,
  LearningObjectives: LearningObjectivesComponent,
  ChapterRecap: ChapterRecapComponent,
  MustRead: MustReadComponent,
  MandatoryReadCard,
  Checklist,
  LearningLog,
  Video: VideoComponent,
  VideoBlock: VideoComponent,
  VisualWalkthrough: VisualWalkthroughComponent,
  VisualDiagram: VisualDiagramComponent,
  Roadmap: RoadmapComponent,
  MermaidDiagram,
  StateMachine: MermaidDiagram,
  EntityDiagram: MermaidDiagram,
  EcosystemGallery,
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p {...props}>
      <ChapterRefChildren>{children}</ChapterRefChildren>
    </p>
  ),
  li: ({ children, ...props }: React.ComponentProps<"li">) => (
    <li {...props}>
      <ChapterRefChildren>{children}</ChapterRefChildren>
    </li>
  ),
  blockquote: ({ children, ...props }: React.ComponentProps<"blockquote">) => (
    <blockquote {...props}>
      <ChapterRefChildren>{children}</ChapterRefChildren>
    </blockquote>
  ),
  h2: ({ children, ...props }: React.ComponentProps<"h2">) => {
    const text = typeof children === "string" ? children : undefined;
    const id = text ? slugify(text) : undefined;
    return (
      <>
      <h2
        id={id}
        className="mt-12 border-b border-border pb-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        {...props}
      >
        {children}
      </h2>
      {id ? <HeadingNoteButton headingId={id} /> : null}
    </>
    );
  },
  h3: ({ children, ...props }: React.ComponentProps<"h3">) => {
    const text = typeof children === "string" ? children : undefined;
    const id = text ? slugify(text) : undefined;
    return (
      <>
      <h3
        id={id}
        className="mt-8 text-lg font-semibold tracking-tight text-foreground"
        {...props}
      >
        {children}
      </h3>
      {id ? <HeadingNoteButton headingId={id} /> : null}
    </>
    );
  },
  table: (props: React.ComponentProps<"table">) => (
    <div className="not-prose my-8 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="overflow-x-auto">
        <table
          className={cn("w-full border-collapse text-[15px] leading-relaxed", cellBorder)}
          {...props}
        />
      </div>
    </div>
  ),
  thead: (props: React.ComponentProps<"thead">) => (
    <thead className="bg-muted" {...props} />
  ),
  tbody: (props: React.ComponentProps<"tbody">) => (
    <tbody className="bg-card" {...props} />
  ),
  tr: (props: React.ComponentProps<"tr">) => (
    <tr className="transition-colors hover:bg-muted/50" {...props} />
  ),
  th: (props: React.ComponentProps<"th">) => (
    <th
      className={cn(
        cellBorder,
        "px-6 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
      )}
      {...props}
    />
  ),
  td: ({ children, ...props }: React.ComponentProps<"td">) => (
    <td
      className={cn(
        cellBorder,
        "px-6 py-5 align-top text-foreground/85",
        "[&:first-child]:min-w-[7rem] [&:first-child]:font-semibold [&:first-child]:text-foreground"
      )}
      {...props}
    >
      <ChapterRefChildren>{children}</ChapterRefChildren>
    </td>
  ),
  figure: MdxCodeFigure,
  pre: MdxCodePre,
  code: MdxCodeElement,
};
