import { useRouteError, useNavigate } from "react-router";
import type { Route } from "./+types/tour.$tourId.$step";
import { queryClient } from "../lib/query-client";
import { treePathsOptions, treeInfoOptions, treeFileContentOptions, tourOptions } from "../queries/tree";
import { diffOptions } from "../queries/diff";
import { repoInfoOptions } from "../queries/info";
import { TreePage } from "../components/tree/tree-page";
import { DiffPage } from "../components/diff/diff-page";
import { ErrorPage } from "../components/error-page";
import { canRenderTourStepInDiff } from "../lib/tour-diff";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const tourId = params.tourId;
  const stepIndex = parseInt(params.step, 10);

  const tour = await queryClient.ensureQueryData(tourOptions(tourId));

  if (stepIndex > 0) {
    const step = tour.steps[stepIndex - 1];
    if (step) {
      if (step.viewMode === "diff") {
        const [diff] = await Promise.all([
          queryClient.ensureQueryData(diffOptions(false, tour.ref)),
          queryClient.ensureQueryData(repoInfoOptions(tour.ref)),
        ]);
        if (canRenderTourStepInDiff(diff, step)) {
          return { tourId, stepIndex, renderDiff: true, ref: tour.ref };
        }
      }

      try {
        await queryClient.ensureQueryData(treeFileContentOptions(step.filePath));
      } catch {
        // File may not exist — the viewer will handle the missing content
      }
    }
  }

  await Promise.all([
    queryClient.ensureQueryData(treePathsOptions()),
    queryClient.ensureQueryData(treeInfoOptions()),
  ]);
  return { tourId, stepIndex, renderDiff: false, ref: tour.ref };
}

export default function TourStepRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.renderDiff) {
    return (
      <DiffPage
        tourId={loaderData.tourId}
        tourStepIndex={loaderData.stepIndex}
        initialRef={loaderData.ref}
      />
    );
  }
  return <TreePage tourId={loaderData.tourId} tourStepIndex={loaderData.stepIndex} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  return (
    <ErrorPage
      error={error}
      actions={[
        { label: "Go back", primary: true, onClick: () => navigate(-1) },
        { label: "Browse files", onClick: () => navigate("/tree") },
      ]}
    />
  );
}
