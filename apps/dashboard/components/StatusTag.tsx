import { Badge } from "./ui/Badge";
import type { BotResult } from "../lib/api";
import { formatBotStatusBadgeAz, hasBotCloudArtifact } from "../lib/locale";

export default function StatusTag({
  status,
  result,
}: {
  status: string;
  /** İstifadəçi recordu dayandırdıqda (`cancelled`) nişanı düzgün az mətn ilə göstərilir. */
  result?: BotResult | null;
}) {
  const norm = status.toLowerCase();
  const cancelledEarly = norm === "completed" && Boolean(result?.cancelled);
  const cancelledButCloudOk = cancelledEarly && hasBotCloudArtifact(result);
  const successOk =
    (norm === "completed" && result && !result.cancelled) || cancelledButCloudOk;
  const cancelledOnlyStopped = cancelledEarly && !cancelledButCloudOk;

  const variant: "default" | "success" | "danger" | "warning" | "secondary" =
    successOk
      ? "success"
      : cancelledOnlyStopped
        ? "warning"
        : norm === "completed"
          ? "success"
          : norm === "failed"
            ? "danger"
            : norm === "active"
              ? "default"
              : norm === "delayed" || norm === "paused"
                ? "secondary"
                : "warning";
  return <Badge variant={variant}>{formatBotStatusBadgeAz(status, result)}</Badge>;
}
