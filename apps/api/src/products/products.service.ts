import { ForbiddenException, Inject, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { MediaProcessingStatus, MembershipRole, MembershipStatus, ProductStatus, RetailerStatus } from "../generated/prisma/enums.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import type { CreateProductDto, UpdateProductDto } from "./dto/product.dto.js";

const editors: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.MANAGER];
const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  store: { select: { id: true, name: true } },
  images: { where: { mediaAsset: { is: { processingStatus: MediaProcessingStatus.READY, deletedAt: null } } }, orderBy: { sortOrder: "asc" }, include: { mediaAsset: { select: { id: true, altText: true, width: true, height: true } } } },
} as const;
type ProductWithMedia = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class ProductsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(user: AuthPrincipal, retailerId: string) {
    await this.requireMember(user.userId, retailerId, false);
    const products = await this.prisma.product.findMany({
      where: { retailerId, status: { not: ProductStatus.ARCHIVED } },
      orderBy: { updatedAt: "desc" },
      include: productInclude,
    });
    return products.map((product) => this.present(product));
  }

  async get(user: AuthPrincipal, retailerId: string, productId: string) {
    await this.requireMember(user.userId, retailerId, false);
    const product = await this.prisma.product.findFirst({ where: { id: productId, retailerId }, include: productInclude });
    if (!product) throw new NotFoundException("Product not found.");
    return this.present(product);
  }

  async create(user: AuthPrincipal, retailerId: string, input: CreateProductDto) {
    await this.requireMember(user.userId, retailerId, true);
    await this.validateReferences(retailerId, input.categoryId, input.storeId);
    const product = await this.prisma.product.create({
      data: { retailerId, createdByUserId: user.userId, slug: input.slug, name: input.name, description: input.description || null, brand: input.brand || null, categoryId: input.categoryId, storeId: input.storeId ?? null },
      include: productInclude,
    });
    return this.present(product);
  }

  async update(user: AuthPrincipal, retailerId: string, productId: string, input: UpdateProductDto) {
    await this.requireMember(user.userId, retailerId, true);
    const product = await this.prisma.product.findFirst({ where: { id: productId, retailerId, status: { not: ProductStatus.ARCHIVED } }, select: { id: true } });
    if (!product) throw new NotFoundException("Product not found.");
    if (input.categoryId || input.storeId) await this.validateReferences(retailerId, input.categoryId, input.storeId);
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { ...input, description: input.description === undefined ? undefined : input.description || null, brand: input.brand === undefined ? undefined : input.brand || null },
      include: productInclude,
    });
    return this.present(updated);
  }

  async archive(user: AuthPrincipal, retailerId: string, productId: string) {
    await this.requireMember(user.userId, retailerId, true);
    const result = await this.prisma.product.updateMany({ where: { id: productId, retailerId, status: { not: ProductStatus.ARCHIVED } }, data: { status: ProductStatus.ARCHIVED } });
    if (!result.count) throw new NotFoundException("Product not found.");
    return { id: productId, status: "archived" };
  }

  private async validateReferences(retailerId: string, categoryId?: string, storeId?: string) {
    if (categoryId && !(await this.prisma.category.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } }))) throw new BadRequestException("The category is unavailable.");
    if (storeId && !(await this.prisma.store.findFirst({ where: { id: storeId, retailerId }, select: { id: true } }))) throw new BadRequestException("The store is unavailable to this retailer.");
  }

  private present(product: ProductWithMedia) {
    const { images, ...data } = product;
    const gallery = images.map(({ mediaAsset, sortOrder, isPrimary }) => ({ id: mediaAsset.id, url: `/media/${mediaAsset.id}`, altText: mediaAsset.altText ?? product.name, sortOrder, isPrimary, width: mediaAsset.width, height: mediaAsset.height }));
    const image = gallery.find(({ isPrimary }) => isPrimary);
    return { ...data, images: gallery, image: image?.url ?? null, imageAlt: image?.altText ?? product.name };
  }

  private async requireMember(userId: string, retailerId: string, write: boolean) {
    const member = await this.prisma.retailerMembership.findFirst({ where: { userId, retailerId, status: MembershipStatus.ACTIVE }, select: { role: true, retailer: { select: { status: true } } } });
    if (!member) throw new NotFoundException("Retailer not found.");
    if (write && (!editors.includes(member.role) || member.retailer.status === RetailerStatus.CLOSED || member.retailer.status === RetailerStatus.SUSPENDED)) throw new ForbiddenException("You cannot manage products for this retailer.");
  }
}
