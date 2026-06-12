import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "~/shopify.server";
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import {
  Page,
  Card,
  BlockStack,
  TextField,
  Button,
  Text,
  InlineError,
} from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { useState } from "react";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = login ? await login(request) : null;
  return json({
    errors,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return login ? await login(request) : null;
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");

  const errors = (actionData as any)?.errors || loaderData.errors;

  return (
    <AppProvider isEmbeddedApp apiKey={loaderData.apiKey} i18n={enTranslations}>
      <Page>
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">
              Log in to Mango Product Feed
            </Text>
            <Form method="post">
              <BlockStack gap="300">
                <TextField
                  label="Shop domain"
                  type="text"
                  name="shop"
                  value={shop}
                  onChange={setShop}
                  placeholder="my-shop.myshopify.com"
                  autoComplete="off"
                />
                {errors?.shop && (
                  <InlineError message={errors.shop} fieldID="shop" />
                )}
                <Button submit variant="primary">
                  Log in
                </Button>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>
      </Page>
    </AppProvider>
  );
}
