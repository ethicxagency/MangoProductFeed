import { type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";

// GraphQL query to fetch all products for a shop using the stored session
const ALL_PRODUCTS_QUERY = `
  query GetAllProductsForFeed($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          status
          description
          descriptionHtml
          vendor
          productType
          tags
          onlineStoreUrl
          featuredImage {
            url
            altText
          }
          images(first: 5) {
            edges {
              node {
                url
                altText
              }
            }
          }
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                barcode
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
    shop {
      name
      myshopifyDomain
      primaryDomain {
        url
      }
      currencyCode
    }
  }
`;

function escapeXml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { token } = params;

  if (!token) {
    return new Response("Feed token required", { status: 400 });
  }

  // Look up feed by token
  const feed = await prisma.productFeed.findUnique({
    where: { feedToken: token },
  });

  if (!feed) {
    return new Response("Feed not found", { status: 404 });
  }

  // Get the session for this shop to make API calls
  const { PrismaSessionStorage } = await import(
    "@shopify/shopify-app-session-storage-prisma"
  );
  const { shopifyApp, ApiVersion } = await import(
    "@shopify/shopify-app-remix/server"
  );

  // Fetch session directly from DB
  const session = await prisma.session.findFirst({
    where: { shop: feed.shop, isOnline: false },
  });

  if (!session) {
    return new Response("Shop session not found. Please reinstall the app.", {
      status: 403,
    });
  }

  // Build Shopify REST/GraphQL client using stored access token
  const shopDomain = feed.shop;
  const accessToken = session.accessToken;
  const apiVersion = "2024-10";

  let allProducts: any[] = [];
  let shopData: any = null;
  let hasNextPage = true;
  let cursor: string | null = null;

  try {
    while (hasNextPage) {
      const gqlResponse = await fetch(
        `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({
            query: ALL_PRODUCTS_QUERY,
            variables: { first: 250, after: cursor },
          }),
        }
      );

      const { data, errors } = await gqlResponse.json();

      if (errors) {
        console.error("GraphQL errors:", errors);
        break;
      }

      if (!shopData) shopData = data.shop;

      const edges = data.products.edges;
      allProducts = [...allProducts, ...edges.map((e: any) => e.node)];
      hasNextPage = data.products.pageInfo.hasNextPage;
      cursor = data.products.pageInfo.endCursor;
    }
  } catch (err) {
    console.error("Error fetching products for feed:", err);
    return new Response("Error fetching product data", { status: 500 });
  }

  const storeUrl = shopData?.primaryDomain?.url || `https://${shopDomain}`;
  const storeName = shopData?.name || shopDomain;
  const currency = shopData?.currencyCode || "USD";
  const now = new Date().toISOString();

  // Filter active products only
  const activeProducts = allProducts.filter((p) => p.status === "ACTIVE");

  // Build Google Shopping XML feed
  const xmlItems = activeProducts
    .map((product) => {
      const variant = product.variants.edges[0]?.node;
      const price = variant?.price || "0.00";
      const compareAtPrice = variant?.compareAtPrice;
      const sku = variant?.sku || product.handle;
      const barcode = variant?.barcode || "";
      const imageUrl =
        product.featuredImage?.url ||
        product.images.edges[0]?.node?.url ||
        "";
      const productUrl = product.onlineStoreUrl || `${storeUrl}/products/${product.handle}`;
      const description = stripHtml(product.descriptionHtml || product.description || "");
      const availability = (variant?.inventoryQuantity ?? 1) > 0 ? "in stock" : "out of stock";
      const additionalImages = product.images.edges
        .slice(1, 10)
        .map(
          (e: any) =>
            `<g:additional_image_link>${escapeXml(e.node.url)}</g:additional_image_link>`
        )
        .join("\n        ");

      const productId = product.id.replace("gid://shopify/Product/", "");

      return `    <item>
      <g:id>${escapeXml(productId)}</g:id>
      <title>${escapeXml(product.title)}</title>
      <description>${escapeXml(description)}</description>
      <link>${escapeXml(productUrl)}</link>
      <g:image_link>${escapeXml(imageUrl)}</g:image_link>
      ${additionalImages}
      <g:availability>${availability}</g:availability>
      <g:price>${escapeXml(price)} ${currency}</g:price>
      ${compareAtPrice ? `<g:sale_price>${escapeXml(price)} ${currency}</g:sale_price>` : ""}
      ${compareAtPrice ? `<g:original_price>${escapeXml(compareAtPrice)} ${currency}</g:original_price>` : ""}
      <g:brand>${escapeXml(product.vendor)}</g:brand>
      <g:product_type>${escapeXml(product.productType)}</g:product_type>
      ${barcode ? `<g:gtin>${escapeXml(barcode)}</g:gtin>` : ""}
      ${sku ? `<g:mpn>${escapeXml(sku)}</g:mpn>` : ""}
      <g:condition>new</g:condition>
      ${product.tags?.length ? `<g:custom_label_0>${escapeXml(product.tags.slice(0, 3).join(", "))}</g:custom_label_0>` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(storeName)} - Product Feed</title>
    <link>${escapeXml(storeUrl)}</link>
    <description>Product feed for ${escapeXml(storeName)} generated by Mango Product Feed</description>
    <lastBuildDate>${now}</lastBuildDate>
    <g:feed_token>${escapeXml(token)}</g:feed_token>
    <g:total_products>${activeProducts.length}</g:total_products>
${xmlItems}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Feed-Generated": now,
      "X-Feed-Products": String(activeProducts.length),
    },
  });
};
