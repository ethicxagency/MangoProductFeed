import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, Text, Button, Banner,
  Divider, Box, Badge, InlineStack, Icon, Tooltip, Modal,
  Spinner, InlineGrid, DataTable, List, CalloutCard,
} from "@shopify/polaris";
import {
  RefreshIcon, ClipboardIcon, ExternalIcon,
  CheckCircleIcon, AlertCircleIcon, ProductIcon,
} from "@shopify/polaris-icons";
import { v4 as uuidv4 } from "uuid";
import { useState, useCallback } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { authenticate } = await import("~/shopify.server");
  const prisma = (await import("~/db.server")).default;
  const { session } = await authenticate.admin(request);
  const existingFeed = await prisma.productFeed.findUnique({ where: { shop: session.shop } });
  return json({ existingFeed, shop: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { authenticate } = await import("~/shopify.server");
  const prisma = (await import("~/db.server")).default;
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "generate") {
    try {
      const ALL_PRODUCTS_QUERY = `
        query GetAllProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            edges { node { id title handle status } }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      let allProducts: any[] = [];
      let hasNextPage = true;
      let cursor: string | null = null;
      while (hasNextPage) {
        const response = await admin.graphql(ALL_PRODUCTS_QUERY, { variables: { first: 250, after: cursor } });
        const { data } = await response.json();
        allProducts = [...allProducts, ...data.products.edges.map((e: any) => e.node)];
        hasNextPage = data.products.pageInfo.hasNextPage;
        cursor = data.products.pageInfo.endCursor;
      }
      const feedToken = uuidv4();
      const appUrl = process.env.SHOPIFY_APP_URL || "https://your-app-url.com";
      const feedUrl = `${appUrl}/feed/${feedToken}`;
      const feed = await prisma.productFeed.upsert({
        where: { shop },
        update: { feedUrl, feedToken, productCount: allProducts.length, lastGenerated: new Date() },
        create: { shop, feedUrl, feedToken, productCount: allProducts.length },
      });
      return json({ success: true, feed, message: `Successfully generated feed with ${allProducts.length} products!` });
    } catch (error) {
      return json({ success: false, error: "Failed to generate product feed. Please try again." });
    }
  }

  if (intent === "delete") {
    await prisma.productFeed.delete({ where: { shop } }).catch(() => null);
    return json({ success: true, deleted: true });
  }

  return json({ success: false, error: "Unknown intent" });
};

export default function FeedPage() {
  const { existingFeed } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [copied, setCopied] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const isGenerating = navigation.state === "submitting" && navigation.formData?.get("intent") === "generate";
  const isDeleting = navigation.state === "submitting" && navigation.formData?.get("intent") === "delete";
  const feed = (actionData as any)?.feed || existingFeed;
  const deleted = (actionData as any)?.deleted;
  const currentFeed = deleted ? null : feed;

  const handleGenerate = useCallback(() => submit({ intent: "generate" }, { method: "post" }), [submit]);
  const handleDelete = useCallback(() => { setDeleteModalOpen(false); submit({ intent: "delete" }, { method: "post" }); }, [submit]);
  const handleCopy = useCallback(() => {
    if (currentFeed?.feedUrl) {
      navigator.clipboard.writeText(currentFeed.feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [currentFeed]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const feedRows = currentFeed ? [
    ["Feed Token", currentFeed.feedToken],
    ["Products Indexed", currentFeed.productCount.toLocaleString()],
    ["Created", formatDate(currentFeed.createdAt)],
    ["Last Generated", formatDate(currentFeed.lastGenerated)],
  ] : [];

  return (
    <Page title="Product Feed" subtitle="Generate and manage your Shopify product feed URL" backAction={{ content: "Dashboard", url: "/app" }}>
      <BlockStack gap="500">
        {(actionData as any)?.success && (actionData as any)?.message && (
          <Banner tone="success" title="Feed Generated Successfully!"><p>{(actionData as any).message}</p></Banner>
        )}
        {(actionData as any)?.error && (
          <Banner tone="critical" title="Generation Failed"><p>{(actionData as any).error}</p></Banner>
        )}
        {deleted && <Banner tone="info" title="Feed Deleted"><p>Your product feed has been removed.</p></Banner>}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="start">
                  <BlockStack gap="100">
                    <Text variant="headingLg" as="h2">{currentFeed ? "Regenerate Feed" : "Generate Product Feed"}</Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      {currentFeed ? "Refresh your feed to include the latest products." : "Create a unique feed URL containing all your store's product data."}
                    </Text>
                  </BlockStack>
                  <Icon source={ProductIcon} tone="base" />
                </InlineStack>
                <Divider />
                {isGenerating ? (
                  <InlineStack gap="300" blockAlign="center">
                    <Spinner size="small" />
                    <Text variant="bodyMd" as="p" tone="subdued">Fetching products and generating feed URL...</Text>
                  </InlineStack>
                ) : (
                  <InlineStack gap="300">
                    <Button variant="primary" size="large" icon={currentFeed ? RefreshIcon : undefined} onClick={handleGenerate}>
                      {currentFeed ? "Regenerate Feed" : "Generate Product Feed"}
                    </Button>
                    {currentFeed && <Button tone="critical" onClick={() => setDeleteModalOpen(true)} loading={isDeleting}>Delete Feed</Button>}
                  </InlineStack>
                )}
              </BlockStack>
            </Card>

            {currentFeed && (
              <Box paddingBlockStart="400">
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="headingMd" as="h2">Your Feed URL</Text>
                          <Badge tone="success" icon={CheckCircleIcon}>Live</Badge>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued" as="p">Share this URL with external platforms</Text>
                      </BlockStack>
                    </InlineStack>
                    <Divider />
                    <Box background="bg-surface-secondary" padding="400" borderRadius="200" borderWidth="025" borderColor="border">
                      <InlineStack align="space-between" blockAlign="center" gap="300">
                        <Text variant="bodyMd" as="p" breakWord tone="subdued">
                          <code style={{ fontFamily: "monospace", fontSize: "13px", color: "#202223" }}>{currentFeed.feedUrl}</code>
                        </Text>
                        <InlineStack gap="200">
                          <Tooltip content={copied ? "Copied!" : "Copy URL"}>
                            <Button icon={copied ? CheckCircleIcon : ClipboardIcon} onClick={handleCopy} tone={copied ? "success" : undefined}>
                              {copied ? "Copied!" : "Copy"}
                            </Button>
                          </Tooltip>
                          <Button icon={ExternalIcon} url={currentFeed.feedUrl} external>Open</Button>
                        </InlineStack>
                      </InlineStack>
                    </Box>
                    <DataTable columnContentTypes={["text", "text"]} headings={["Property", "Value"]} rows={feedRows} hideScrollIndicator />
                  </BlockStack>
                </Card>
              </Box>
            )}
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <CalloutCard
                title="Feed Format"
                illustration="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                primaryAction={{ content: "View Documentation", url: "https://support.google.com/merchants/answer/7052112", external: true }}
              >
                <p>Your feed is XML format, compatible with Google Shopping, Meta, and other major platforms.</p>
              </CalloutCard>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Compatible Platforms</Text>
                  <Divider />
                  <List>
                    <List.Item>Google Merchant Center</List.Item>
                    <List.Item>Meta Commerce Manager</List.Item>
                    <List.Item>Microsoft Advertising</List.Item>
                    <List.Item>Pinterest Catalogs</List.Item>
                    <List.Item>TikTok Shop</List.Item>
                  </List>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Product Feed?"
        primaryAction={{ content: "Delete Feed", destructive: true, onAction: handleDelete }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Icon source={AlertCircleIcon} tone="critical" />
              <Text variant="bodyMd" as="p">This will permanently delete your product feed URL.</Text>
            </InlineStack>
            <Text variant="bodySm" tone="subdued" as="p">Any external platforms using this URL will no longer sync your products.</Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
