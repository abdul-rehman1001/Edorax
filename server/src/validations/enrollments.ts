import { z } from "zod";
import { id, params } from "./common.js";

export const selfEnrollBody = z.object({ courseId: id, couponCode: z.string().trim().min(3).max(32).optional() });
export const enrollmentParams = params("enrollmentId");
