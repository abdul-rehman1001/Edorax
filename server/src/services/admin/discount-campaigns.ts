import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import type { CreateDiscountCampaignBody } from "../../validations/admin.js";
import { ConflictError, NotFoundError, UnprocessableError } from "../../utils/errors.js";
import { ADMIN_AUDIT_ACTIONS, recordAdminAction, type AdminActor } from "./audit.js";

function courseWhere(input: CreateDiscountCampaignBody): Prisma.CourseWhereInput {
  switch (input.scope) {
    case "CATEGORY": return { category: input.category };
    case "SUBCATEGORY": return { subcategory: { equals: input.subcategory, mode: "insensitive" } };
    case "TAG": return { tags: { has: input.tag!.toLowerCase() } };
    case "SELECTED_COURSES": return { id: { in: input.courseIds } };
    default: return {};
  }
}

export async function listDiscountCampaigns() {
  const [campaigns, courses] = await Promise.all([
    prisma.courseDiscountCampaign.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { coupons: { select: { redemptionCount: true } } },
    }),
    prisma.course.findMany({
      where: { status: "PUBLISHED", pricingType: "PAID" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, slug: true, category: true, subcategory: true, tags: true },
    }),
  ]);
  return {
    campaigns: campaigns.map(({ coupons, ...campaign }) => ({
      ...campaign,
      redemptionCount: coupons.reduce((sum, coupon) => sum + coupon.redemptionCount, 0),
      courseCount: campaign.courseIds.length,
      expiresAt: campaign.expiresAt?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
    })),
    courses,
    subcategories: [...new Set(courses.map((course) => course.subcategory).filter((value): value is string => Boolean(value)))].sort(),
    tags: [...new Set(courses.flatMap((course) => course.tags))].sort(),
  };
}

export async function createDiscountCampaign(actor: AdminActor, input: CreateDiscountCampaignBody) {
  const code = input.code?.trim().toUpperCase() || null;
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) throw new UnprocessableError("The expiration must be in the future.", "VALIDATION_ERROR");
  const courses = await prisma.course.findMany({
    where: { ...courseWhere(input), status: "PUBLISHED", pricingType: "PAID" },
    select: { id: true },
  });
  if (!courses.length) throw new UnprocessableError("No published paid courses match this campaign.", "DISCOUNT_SCOPE_EMPTY");
  const courseIds = courses.map((course) => course.id);
  if (code) {
    const collision = await prisma.instructorCoupon.findFirst({ where: { courseId: { in: courseIds }, code }, select: { id: true } });
    if (collision) throw new ConflictError("This coupon code is already in use on one of the selected courses.", "COUPON_CODE_TAKEN");
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const campaign = await tx.courseDiscountCampaign.create({
        data: {
          createdById: actor.id,
          label: input.label,
          code,
          scope: input.scope,
          category: input.scope === "CATEGORY" ? input.category : null,
          subcategory: input.scope === "SUBCATEGORY" ? input.subcategory : null,
          tag: input.scope === "TAG" ? input.tag!.toLowerCase() : null,
          courseIds,
          percentOff: input.percentOff,
          maxRedemptions: input.maxRedemptions,
          autoApply: input.autoApply,
          expiresAt,
        },
      });
      await tx.instructorCoupon.createMany({
        data: courseIds.map((courseId) => ({
          courseId, createdById: actor.id, campaignId: campaign.id, code, label: input.label,
          percentOff: input.percentOff, maxRedemptions: input.maxRedemptions, autoApply: input.autoApply, expiresAt,
        })),
      });
      await recordAdminAction(tx, {
        actor,
        action: ADMIN_AUDIT_ACTIONS.DISCOUNT_CAMPAIGN_CREATE,
        targetType: "CourseDiscountCampaign",
        targetId: campaign.id,
        summary: `Created ${input.percentOff}% discount campaign "${input.label}" for ${courseIds.length} courses`,
        metadata: { scope: input.scope, category: input.category ?? null, subcategory: input.subcategory ?? null, tag: input.tag ?? null, courseCount: courseIds.length, code, autoApply: input.autoApply },
      });
      return { ...campaign, courseCount: courseIds.length, expiresAt: campaign.expiresAt?.toISOString() ?? null, createdAt: campaign.createdAt.toISOString() };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new ConflictError("That coupon code is already in use.", "COUPON_CODE_TAKEN");
    throw error;
  }
}

export async function setDiscountCampaignActive(actor: AdminActor, campaignId: string, active: boolean) {
  const campaign = await prisma.courseDiscountCampaign.findUnique({ where: { id: campaignId }, select: { id: true, label: true, courseIds: true, active: true } });
  if (!campaign) throw new NotFoundError("Discount campaign not found.");
  await prisma.$transaction(async (tx) => {
    await tx.courseDiscountCampaign.update({ where: { id: campaignId }, data: { active } });
    await tx.instructorCoupon.updateMany({ where: { campaignId }, data: { active } });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.DISCOUNT_CAMPAIGN_SET_ACTIVE,
      targetType: "CourseDiscountCampaign",
      targetId: campaignId,
      summary: `${active ? "Activated" : "Paused"} discount campaign "${campaign.label}"`,
      metadata: { from: campaign.active, to: active, courseCount: campaign.courseIds.length },
    });
  });
}
