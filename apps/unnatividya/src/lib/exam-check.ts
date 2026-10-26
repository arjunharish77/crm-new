import type { ExamUniversity } from "@/data/exam-requirements";

// Wave 5 B1: compare what the browser can report about this computer with a university's published
// exam requirements. Browsers report some things only roughly (memory is capped at 8 GB, the
// connection estimate at 10 Mbps) or not at all (the processor model, the Windows version), so those
// are "check yourself", never a pass.

export type DeviceInfo = {
  mobile: boolean;
  os: "Windows" | "macOS" | "Linux" | "ChromeOS" | "Android" | "iOS" | "Other";
  browser: "Chrome" | "Edge" | "Firefox" | "Safari" | "Other";
  screen: { width: number; height: number };
  memoryGb: number | null;
  downlinkMbps: number | null;
};

export type CheckStatus = "ok" | "check" | "problem";
export type DeviceCheck = { id: string; label: string; status: CheckStatus; detail: string };

export function readDevice(nav: Navigator & { userAgentData?: { mobile?: boolean }; deviceMemory?: number; connection?: { downlink?: number } }, screen: { width: number; height: number }, pixelRatio: number): DeviceInfo {
  const ua = nav.userAgent || "";
  const mobile = nav.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const os: DeviceInfo["os"] = /Windows NT/i.test(ua) ? "Windows" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /CrOS/i.test(ua) ? "ChromeOS" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Other";
  const browser: DeviceInfo["browser"] = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";
  return {
    mobile, os, browser,
    screen: { width: Math.round(screen.width * pixelRatio), height: Math.round(screen.height * pixelRatio) },
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    downlinkMbps: typeof nav.connection?.downlink === "number" ? nav.connection.downlink : null,
  };
}

export function deviceChecks(device: DeviceInfo, university: ExamUniversity): DeviceCheck[] {
  const rules = university.checks;
  const checks: DeviceCheck[] = [];
  checks.push(device.mobile
    ? { id: "computer", label: "Computer", status: "problem", detail: rules.computerOnly ? `This looks like a phone or tablet. ${university.name} needs a desktop or laptop.` : "This looks like a phone or tablet." }
    : { id: "computer", label: "Computer", status: "ok", detail: "This looks like a desktop or laptop." });
  if (rules.windowsOnly) checks.push(device.os === "Windows"
    ? { id: "os", label: "Operating system", status: "check", detail: "Windows detected. Check it is Windows 10 or later and up to date; browsers can't report the version." }
    : { id: "os", label: "Operating system", status: "problem", detail: `${device.os} detected. ${university.name}'s exam runs only on Windows 10 or later.` });
  else checks.push({ id: "os", label: "Operating system", status: "check", detail: `${device.os} detected. Keep it updated, and confirm with the university that it's supported.` });
  if (rules.browsers) checks.push(rules.browsers.includes(device.browser)
    ? { id: "browser", label: "Browser", status: "ok", detail: `${device.browser} detected.` }
    : { id: "browser", label: "Browser", status: "problem", detail: `${device.browser} detected. Use ${rules.browsers.join(" or ")} for the exam.` });
  if (rules.minScreen) {
    const fits = device.screen.width >= rules.minScreen.width && device.screen.height >= rules.minScreen.height;
    checks.push({ id: "screen", label: "Screen resolution", status: fits ? "ok" : "problem", detail: `${device.screen.width}×${device.screen.height} detected; ${rules.minScreen.width}×${rules.minScreen.height} needed.` });
  }
  if (rules.memoryGb) checks.push(device.memoryGb === null
    ? { id: "memory", label: "Memory", status: "check", detail: `This browser doesn't report memory. ${rules.memoryGb} GB or more is needed.` }
    : device.memoryGb >= rules.memoryGb
      ? { id: "memory", label: "Memory", status: "ok", detail: `Your browser reports ${rules.memoryGb} GB or more.` }
      : { id: "memory", label: "Memory", status: "problem", detail: `Your browser reports about ${device.memoryGb} GB; ${rules.memoryGb} GB or more is needed.` });
  if (rules.windowsOnly) checks.push({ id: "processor", label: "Processor", status: "check", detail: "Browsers can't report it. Check it is an Intel Core i5 10th Gen or above, 2.4 GHz or more (Windows: Settings → System → About)." });
  if (rules.minMbps) checks.push(device.downlinkMbps === null
    ? { id: "internet", label: "Internet", status: "check", detail: `This browser doesn't estimate speed. Run a speed test: ${rules.minMbps} Mbps or more is needed, steadily.` }
    : device.downlinkMbps >= rules.minMbps
      ? { id: "internet", label: "Internet", status: "check", detail: `Your browser estimates about ${device.downlinkMbps} Mbps. ${rules.minMbps} Mbps is needed throughout the exam, so run a speed test at the time and place you'll take it.` }
      : { id: "internet", label: "Internet", status: "problem", detail: `Your browser estimates about ${device.downlinkMbps} Mbps; ${rules.minMbps} Mbps or more is needed. Run a speed test to confirm.` });
  else checks.push({ id: "internet", label: "Internet", status: "check", detail: "Use a reliable, good-speed connection; a wired connection is steadier." });
  return checks;
}

export function cameraCheck(settings: { width?: number; height?: number; frameRate?: number }, university: ExamUniversity): DeviceCheck {
  const need = university.checks.camera;
  const size = settings.width && settings.height ? `${settings.width}×${settings.height}${settings.frameRate ? ` at ${Math.round(settings.frameRate)} fps` : ""}` : "an unknown size";
  if (!need) return { id: "camera", label: "Camera", status: "ok", detail: `Your camera works (${size}).` };
  const ok = (settings.width ?? 0) >= need.width && (settings.height ?? 0) >= need.height && (settings.frameRate === undefined || settings.frameRate >= need.fps);
  return { id: "camera", label: "Camera", status: ok ? "ok" : "problem", detail: `Your camera works (${size}); ${need.width}×${need.height} at ${need.fps} fps is listed.` };
}
