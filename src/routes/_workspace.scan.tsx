import { createFileRoute } from "@tanstack/react-router";
import { Camera, Check, RefreshCw, ScanLine, SwitchCamera, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { soilApi, type ScanField, type ScanJob } from "@/services/soil-api";

export const Route = createFileRoute("/_workspace/scan")({ component: ScanPage });

const fieldsToReview = [
  ["farmer_name", "Farmer name"],
  ["card_number", "Card / report number"],
  ["state", "State"],
  ["district", "District"],
  ["block_village", "Block / village"],
  ["sample_date", "Sample collection date"],
  ["test_date", "Soil test date"],
  ["survey_field_id", "Survey / field ID"],
  ["ph", "Soil pH"],
  ["electrical_conductivity", "Electrical conductivity (EC)"],
  ["organic_carbon", "Organic carbon (OC)"],
  ["available_nitrogen", "Available nitrogen (N)"],
  ["available_phosphorus", "Available phosphorus (P)"],
  ["available_potassium", "Available potassium (K)"],
  ["sulfur", "Sulfur (S)"],
  ["zinc", "Zinc (Zn)"],
  ["iron", "Iron (Fe)"],
  ["manganese", "Manganese (Mn)"],
  ["copper", "Copper (Cu)"],
  ["boron", "Boron (B)"],
] as const;

function ScanPage() {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<ScanJob | null>(null);
  const [values, setValues] = useState<Record<string, ScanField>>({});
  const [saved, setSaved] = useState<ScanJob | null>(null);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current)
      videoRef.current.srcObject = streamRef.current;
  }, [cameraOn]);

  async function startCamera(index?: number) {
    setCameraError("");
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
      const list = await navigator.mediaDevices.enumerateDevices();
      const cameras = list.filter((item) => item.kind === "videoinput");
      setDevices(cameras);
      if (!cameras.length) throw new Error("unavailable");
      if (!cameras.length) throw new Error("unavailable");
      const preferred = index === undefined ? undefined : cameras[index]?.deviceId;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: preferred
          ? { deviceId: { exact: preferred } }
          : { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (item) => item.kind === "videoinput",
        ),
      );
      setCameraOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (cause) {
      setCameraOn(false);
      setCameraError(
        cause instanceof Error && cause.message === "unavailable"
          ? t("scan.cameraUnavailable")
          : t("scan.cameraError"),
      );
    }
  }
  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }
  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (blob) {
      setFile(new File([blob], "soil-card-capture.jpg", { type: "image/jpeg" }));
      stopCamera();
      setJob(null);
      setSaved(null);
    }
  }
  function selectFile(next: File | undefined) {
    if (!next) return;
    if (
      !/[.](jpe?g|png|pdf)$/i.test(next.name) ||
      (next.type && !["image/jpeg", "image/png", "application/pdf"].includes(next.type))
    ) {
      setError(t("scan.invalidFile"));
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError(t("scan.tooLarge", { size: 10 }));
      return;
    }
    setError("");
    setFile(next);
    setJob(null);
    setSaved(null);
    stopCamera();
  }
  async function extract() {
    if (!file) return;
    setBusy(true);
    setError("");
    setStage("uploaded");
    try {
      setStage("extracting_text");
      const result = await soilApi.scan(file);
      setJob(result);
      setValues(result.extracted_fields ?? {});
      setStage("review_required");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("scan.error"));
      setStage("failed");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const result = await soilApi.confirmScan(job.scan_id, values);
      setJob(result);
      setSaved(result);
      setStage("confirmed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("scan.error"));
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setFile(null);
    setJob(null);
    setSaved(null);
    setValues({});
    setError("");
    setStage("");
  }
  const reviewRows: readonly (readonly [string, string])[] = [
    ...fieldsToReview,
    ...Object.keys(values)
      .filter((key) => !fieldsToReview.some(([known]) => known === key))
      .map((key) => [key, key.replace(/^other_measurement_/, "").replaceAll("_", " ")] as const),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("scan.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("scan.subtitle")}</p>
      </header>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
        {t("scan.notAnalysis")}
      </div>
      {!job && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Camera className="h-4 w-4" />
                {t("scan.camera")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cameraOn ? (
                <>
                  <div className="relative overflow-hidden rounded-lg bg-black">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="max-h-[420px] w-full object-contain"
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-[8%] rounded-md border-2 border-dashed border-white/80"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("scan.cameraHint")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={capture}>
                      <Camera className="mr-2 h-4 w-4" />
                      {t("scan.capture")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const next = (deviceIndex + 1) % devices.length;
                        setDeviceIndex(next);
                        void startCamera(next);
                      }}
                      disabled={devices.length < 2}
                    >
                      <SwitchCamera className="mr-2 h-4 w-4" />
                      {t("scan.switchCamera")}
                    </Button>
                    <Button variant="ghost" onClick={stopCamera}>
                      {t("scan.stopCamera")}
                    </Button>
                  </div>
                </>
              ) : (
                <Button variant="outline" onClick={() => void startCamera()}>
                  <Camera className="mr-2 h-4 w-4" />
                  {t("scan.startCamera")}
                </Button>
              )}
              {cameraError && (
                <p role="alert" className="text-sm text-destructive">
                  {cameraError}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" />
                {t("scan.upload")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("scan.chooseFile", { size: 10 })}</p>
              <Input
                type="file"
                accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
                onChange={(event) => selectFile(event.target.files?.[0])}
              />
            </CardContent>
          </Card>
        </div>
      )}
      {file && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("scan.preview")}: {file.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview &&
              (file.type === "application/pdf" ? (
                <iframe
                  title={t("scan.preview")}
                  src={preview}
                  className="h-[520px] w-full rounded border"
                />
              ) : (
                <img
                  src={preview}
                  alt={t("scan.preview")}
                  className="max-h-[520px] max-w-full rounded object-contain"
                />
              ))}
            {!job && (
              <div className="flex gap-2">
                <Button onClick={() => void extract()} disabled={busy}>
                  <ScanLine className="mr-2 h-4 w-4" />
                  {busy ? t("scan.processing") : t("scan.process")}
                </Button>
                <Button variant="outline" onClick={reset}>
                  {t("scan.replace")}
                </Button>
              </div>
            )}
            {busy && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("scan.processing")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("scan.error")}: {error}
        </p>
      )}
      {job && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("scan.review")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {t("scan.status")}: {stage || job.status}
              </p>
              {job.warnings.map((warning) => (
                <p key={warning} className="text-sm text-amber-700">
                  {warning}
                </p>
              ))}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">{t("scan.field")}</th>
                      <th className="p-2">{t("scan.value")}</th>
                      <th className="p-2">{t("scan.unit")}</th>
                      <th className="p-2">{t("scan.confidence")}</th>
                      <th className="p-2">{t("scan.status")}</th>
                      <th className="p-2">{t("scan.context")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.map(([key, label]) => {
                      const item = values[key] ?? {
                        value: "",
                        unit: "",
                        review_status: "missing" as const,
                      };
                      return (
                        <tr key={key} className="border-b">
                          <td className="p-2 font-medium">{label}</td>
                          <td className="p-2">
                            <Input
                              aria-label={`${label} ${t("scan.value")}`}
                              value={item.value ?? ""}
                              disabled={Boolean(saved)}
                              placeholder={
                                item.review_status === "missing" ? t("scan.missing") : ""
                              }
                              onChange={(e) =>
                                setValues((prev) => ({
                                  ...prev,
                                  [key]: {
                                    ...item,
                                    value: e.target.value,
                                    review_status: "needs_review",
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              aria-label={`${label} ${t("scan.unit")}`}
                              value={item.unit ?? ""}
                              disabled={Boolean(saved)}
                              onChange={(e) =>
                                setValues((prev) => ({
                                  ...prev,
                                  [key]: { ...item, unit: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            {item.confidence == null ? "—" : `${Math.round(item.confidence)}%`}
                          </td>
                          <td className="p-2">
                            {saved
                              ? t("scan.confirmed")
                              : (item.review_status ?? t("scan.missing"))}
                          </td>
                          <td className="max-w-64 p-2 text-xs text-muted-foreground">
                            {item.source ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  {t("scan.rawText")}
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
                  {job.raw_text || t("scan.missing")}
                </pre>
              </details>
              {saved ? (
                <p className="flex items-center gap-2 text-sm text-green-700">
                  <Check className="h-4 w-4" />
                  {t("scan.recordId", { id: saved.scan_id })}
                </p>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => void confirm()} disabled={busy}>
                    <Check className="mr-2 h-4 w-4" />
                    {t("scan.confirm")}
                  </Button>
                  <Button variant="outline" onClick={reset}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t("scan.rescan")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
