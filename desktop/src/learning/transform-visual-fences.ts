import { load as loadYaml } from 'js-yaml';

/**
 * Transforms visual and interactive content fences (```video, ```walkthrough, ```diagram,
 * ```roadmap, ```canvas, ```lab, ```quiz, ```openquestion, ```predict, ```codeexercise) authored in markdown
 * into their corresponding interactive JSX components on the desktop reader side.
 */
export function transformVisualFences(source: string): string {
  if (!source) return source;

  return source.replace(
    /(?:^|[\r\n])[ \t]*```(video|walkthrough|diagram|roadmap|quiz|openquestion|predict|codeexercise|canvas|lab)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g,
    (match, fenceType, yamlText) => {
      try {
        const parsed = loadYaml(yamlText);
        if (!parsed || typeof parsed !== 'object') return match;
        const data = parsed as Record<string, unknown>;

        if (fenceType === 'canvas') {
          // Portable canvas: a catalog renderer configured with plain data (no JSX, JS or raw SVG).
          if (typeof data.renderer !== 'string') return match;
          const {
            renderer,
            version,
            presentation,
            data: nestedData,
            ...rest
          } = data;
          const basePayload =
            nestedData &&
            typeof nestedData === 'object' &&
            !Array.isArray(nestedData)
              ? { ...rest, ...(nestedData as Record<string, unknown>) }
              : rest;
          const versionAttr =
            typeof version === 'number' ? ` version={${version}}` : '';
          const presAttr =
            presentation && typeof presentation === 'object'
              ? ` presentation={${JSON.stringify(presentation)}}`
              : '';
          return `\n\n<InteractiveCanvas renderer=${JSON.stringify(renderer)}${versionAttr}${presAttr} data={${JSON.stringify(basePayload)}} />\n\n`;
        }

        if (fenceType === 'lab') {
          // Portable architecture or networking lab board configured with plain data.
          const { version, presentation, data: nestedData, ...rest } = data;
          const specPayload =
            nestedData &&
            typeof nestedData === 'object' &&
            !Array.isArray(nestedData)
              ? { ...rest, ...(nestedData as Record<string, unknown>) }
              : rest;
          if (typeof specPayload.family !== 'string') return match;
          const versionAttr =
            typeof version === 'number' ? ` version={${version}}` : '';
          const presAttr =
            presentation && typeof presentation === 'object'
              ? ` presentation={${JSON.stringify(presentation)}}`
              : '';
          return `\n\n<Lab${versionAttr}${presAttr} spec={${JSON.stringify(specPayload)}} />\n\n`;
        }

        if (fenceType === 'video') {
          const src = data.sourceUrl ?? data.src ?? data.url;
          if (!src || typeof src !== 'string') return match;
          const title = data.title
            ? ` title=${JSON.stringify(String(data.title))}`
            : '';
          const caption = data.caption
            ? ` caption=${JSON.stringify(String(data.caption))}`
            : '';
          const transcriptUrl = data.transcriptUrl
            ? ` transcriptUrl=${JSON.stringify(String(data.transcriptUrl))}`
            : '';
          return `\n\n<VideoBlock src=${JSON.stringify(src.trim())}${title}${caption}${transcriptUrl} />\n\n`;
        }

        if (fenceType === 'walkthrough') {
          if (!data.steps || !Array.isArray(data.steps)) return match;
          const title = data.title
            ? ` title=${JSON.stringify(String(data.title))}`
            : '';
          return `\n\n<VisualWalkthrough${title} steps={${JSON.stringify(data.steps)}} />\n\n`;
        }

        if (fenceType === 'diagram') {
          if (!data.imageUrl) return match;
          const title = data.title
            ? ` title=${JSON.stringify(String(data.title))}`
            : '';
          const alt = data.alt
            ? ` alt=${JSON.stringify(String(data.alt))}`
            : '';
          const caption = data.caption
            ? ` caption=${JSON.stringify(String(data.caption))}`
            : '';
          const kind = data.kind
            ? ` kind=${JSON.stringify(String(data.kind))}`
            : '';
          return `\n\n<VisualDiagram${title} imageUrl=${JSON.stringify(String(data.imageUrl))}${alt}${caption}${kind} />\n\n`;
        }

        if (fenceType === 'roadmap') {
          const milestones = data.milestones ?? data.phases;
          if (!milestones || !Array.isArray(milestones)) return match;
          const title = data.title
            ? ` title=${JSON.stringify(String(data.title))}`
            : '';
          return `\n\n<Roadmap${title} milestones={${JSON.stringify(milestones)}} />\n\n`;
        }

        if (fenceType === 'quiz') {
          const prompt = data.prompt ?? data.question;
          if (!prompt || typeof prompt !== 'string') return match;
          const options = data.options;
          const quizType =
            data.quizType ?? (data.type === 'mcq' ? 'single' : 'single');
          const correctOptionIds =
            data.correctOptionIds ??
            (typeof data.correct === 'number'
              ? [`opt-${data.correct}`]
              : undefined);
          const explanation = data.explanation
            ? ` explanation=${JSON.stringify(String(data.explanation))}`
            : '';
          const allowRetry =
            data.allowRetry !== undefined
              ? ` allowRetry={${Boolean(data.allowRetry)}}`
              : '';

          if (Array.isArray(options)) {
            const normalizedOpts = options.map((opt, i) =>
              typeof opt === 'string'
                ? { id: `opt-${i}`, label: opt }
                : typeof opt === 'object' && opt !== null
                  ? opt
                  : { id: `opt-${i}`, label: String(opt) },
            );
            return `\n\n<Quiz prompt=${JSON.stringify(prompt)} quizType=${JSON.stringify(quizType)} options={${JSON.stringify(normalizedOpts)}}${correctOptionIds ? ` correctOptionIds={${JSON.stringify(correctOptionIds)}}` : ''}${explanation}${allowRetry} />\n\n`;
          }
          return `\n\n<OpenQuestion prompt=${JSON.stringify(prompt)} />\n\n`;
        }

        if (fenceType === 'openquestion') {
          const prompt = data.prompt ?? data.question;
          if (!prompt || typeof prompt !== 'string') return match;
          const minWords =
            typeof data.minWords === 'number'
              ? ` minWords={${data.minWords}}`
              : '';
          const sampleAnswer = data.sampleAnswer ?? data.modelAnswer;
          const sampleAnswerAttr = sampleAnswer
            ? ` sampleAnswer=${JSON.stringify(String(sampleAnswer))}`
            : '';
          const allowUrl =
            data.allowUrl !== undefined
              ? ` allowUrl={${Boolean(data.allowUrl)}}`
              : '';
          const urlLabel = data.urlLabel
            ? ` urlLabel=${JSON.stringify(String(data.urlLabel))}`
            : '';
          const urlRequired =
            data.urlRequired !== undefined
              ? ` urlRequired={${Boolean(data.urlRequired)}}`
              : '';
          return `\n\n<OpenQuestion prompt=${JSON.stringify(prompt)}${minWords}${sampleAnswerAttr}${allowUrl}${urlLabel}${urlRequired} />\n\n`;
        }

        if (fenceType === 'predict') {
          const prompt = data.prompt;
          if (!prompt || typeof prompt !== 'string') return match;
          const options = data.options;
          if (!options || !Array.isArray(options)) return match;
          const normalizedOpts = options.map((opt, i) =>
            typeof opt === 'string'
              ? { id: `opt-${i}`, label: opt }
              : typeof opt === 'object' && opt !== null
                ? opt
                : { id: `opt-${i}`, label: String(opt) },
          );
          const explanation = data.explanation
            ? ` explanation=${JSON.stringify(String(data.explanation))}`
            : '';
          const contextAttr = data.context
            ? ` context={${JSON.stringify(data.context)}}`
            : '';
          const correctAttr = data.correctOptionId
            ? ` correctOptionId=${JSON.stringify(String(data.correctOptionId))}`
            : '';
          return `\n\n<Predict prompt=${JSON.stringify(prompt)} options={${JSON.stringify(normalizedOpts)}}${explanation}${contextAttr}${correctAttr} />\n\n`;
        }

        if (fenceType === 'codeexercise') {
          const prompt = data.prompt;
          if (!prompt || typeof prompt !== 'string') return match;
          const language = data.language
            ? ` language=${JSON.stringify(String(data.language))}`
            : '';
          const starterCode = data.starterCode
            ? ` starterCode=${JSON.stringify(String(data.starterCode))}`
            : '';
          const filename = data.filename
            ? ` filename=${JSON.stringify(String(data.filename))}`
            : '';
          return `\n\n<CodeExercise prompt=${JSON.stringify(prompt)}${language}${starterCode}${filename} />\n\n`;
        }

        return match;
      } catch {
        return match;
      }
    },
  );
}
