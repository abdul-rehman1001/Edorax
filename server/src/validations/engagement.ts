import { z } from "zod";
import {
  ENGAGEMENT_EVENT_TARGET,
  ENGAGEMENT_EVENT_TYPES,
  ENGAGEMENT_PLATFORMS,
} from "../shared/api/engagement.js";
import { PAGE_AREAS } from "../shared/engagement/mascots.js";
import { id } from "./common.js";

export const trackEventBody = z
  .object({
    type: z.enum(ENGAGEMENT_EVENT_TYPES),
    courseId: id.max(64).optional(),
    chapterId: id.max(64).optional(),
    platform: z.enum(ENGAGEMENT_PLATFORMS).default("web"),
    reading: z.boolean().optional(),
    area: z.enum(PAGE_AREAS).optional(),
  })
  .superRefine((body, ctx) => {
    const target = ENGAGEMENT_EVENT_TARGET[body.type];
    if (target === "course" && !body.courseId) {
      ctx.addIssue({ code: "custom", path: ["courseId"], message: `${body.type} needs a courseId` });
    }
    if (target === "chapter" && !body.chapterId) {
      ctx.addIssue({ code: "custom", path: ["chapterId"], message: `${body.type} needs a chapterId` });
    }
  });
export type TrackEventBody = z.infer<typeof trackEventBody>;
