import { useRouteError, useNavigate } from "react-router";
import type { Route } from "./+types/tree";
import { queryClient } from "../lib/query-client";
import { treePathsOptions, treeInfoOptions, treeFileContentOptions, treeEntriesOptions } from "../queries/tree";
import { TreePage } from "../components/tree/tree-page";
import { ErrorPage } from "../components/error-page";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  const type = (url.searchParams.get("type") || "dir") as "file" | "dir";
  const theme = url.searchParams.get("theme") as "light" | "dark" | null;
  const colorblind = url.searchParams.get("colorblind") === "1";

  const fetches: Promise<unknown>[] = [
    queryClient.ensureQueryData(treePathsOptions()),
    queryClient.ensureQueryData(treeInfoOptions()),
  ];

  if (type === "file" && path) {
    fetches.push(queryClient.ensureQueryData(treeFileContentOptions(path)));
  } else {
    fetches.push(queryClient.ensureQueryData(treeEntriesOptions(path || undefined)));
  }

  await Promise.all(fetches);

  return { path, type, theme, colorblind };
}

export default function TreeRoute() {
  return <TreePage />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  return (
    <ErrorPage
      error={error}
      actions={[
        { label: "View diff", primary: true, onClick: () => navigate("/diff") },
        { label: "Browse root", onClick: () => navigate("/tree") },
      ]}
    />
  );
}
