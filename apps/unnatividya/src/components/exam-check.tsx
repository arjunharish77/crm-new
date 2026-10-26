"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleCheck, ExternalLink } from "lucide-react";
import { EXAM_SOURCES, EXAM_UNIVERSITIES } from "@/data/exam-requirements";
import { cameraCheck, deviceChecks, readDevice, type CheckStatus, type DeviceCheck, type DeviceInfo } from "@/lib/exam-check";
import { formatCheckedDate } from "@/lib/source-checks";

const STATUS: Record<CheckStatus, { label: string; tone: string }> = {
  ok: { label: "Looks fine", tone: "is-success" },
  check: { label: "Check yourself", tone: "is-neutral" },
  problem: { label: "Doesn't meet it", tone: "is-warning" },
};

// Wave 5 B1 (decision V10): the camera and microphone run only after the learner clicks, the preview
// stays on this screen, nothing is recorded or sent, and both stop on "Stop" or when the page closes.
export function ExamCheck() {
  const [universityId, setUniversityId] = useState<string>("");
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [media, setMedia] = useState<{ state: "idle" | "starting" | "on" | "error"; message?: string; camera?: DeviceCheck; level?: number }>({ state: "idle" });
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<{ context: AudioContext; frame: number } | null>(null);
  const university = EXAM_UNIVERSITIES.find(item => item.id === universityId);
  const source = university ? EXAM_SOURCES[university.source] : null;

  // Turn everything off when the learner leaves the page.
  useEffect(() => () => stopTracks(stream, audio), []);
  const stopMedia = () => stopTracks(stream, audio);

  async function startMedia() {
    if (!university) return;
    if (!navigator.mediaDevices?.getUserMedia) { setMedia({ state: "error", message: "This browser can't test the camera and microphone. Try Chrome or Edge." }); return; }
    setMedia({ state: "starting" });
    try {
      const granted = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.current = granted;
      if (video.current) { video.current.srcObject = granted; await video.current.play().catch(() => {}); }
      const settings = granted.getVideoTracks()[0]?.getSettings() || {};
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      context.createMediaStreamSource(granted).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        const peak = data.reduce((max, value) => Math.max(max, Math.abs(value - 128)), 0) / 128;
        setMedia(current => current.state === "on" ? { ...current, level: peak } : current);
        if (audio.current) audio.current.frame = requestAnimationFrame(tick);
      };
      audio.current = { context, frame: requestAnimationFrame(tick) };
      setMedia({ state: "on", camera: cameraCheck(settings, university), level: 0 });
    } catch (error) {
      stopMedia();
      const name = error instanceof DOMException ? error.name : "";
      setMedia({ state: "error", message: name === "NotAllowedError" ? "Access was blocked. Allow the camera and microphone for this page in your browser's site settings, then try again." : name === "NotFoundError" ? "No camera or microphone was found. Connect one, then try again." : "The camera or microphone couldn't start. Close other apps using them, then try again." });
    }
  }

  function stop() { stopMedia(); if (video.current) video.current.srcObject = null; setMedia({ state: "idle" }); }

  const checks = device && university ? deviceChecks(device, university) : [];
  return <div className="uvt-exam">
    <section className="uvt-card" aria-labelledby="exam-university-title">
      <h2 id="exam-university-title" className="uvt-h2-sm">1. Choose your university</h2>
      <div className="uvt-options uvt-exam-unis" role="group" aria-labelledby="exam-university-title">
        {EXAM_UNIVERSITIES.map(item => <button type="button" key={item.id} className="uvt-option" aria-pressed={item.id === universityId} onClick={() => { stop(); setUniversityId(item.id); setDevice(readDevice(navigator, window.screen, window.devicePixelRatio || 1)); }}>
          <span className="uvt-option-text"><span className="uvt-option-label">{item.name}</span></span>
          <CircleCheck size={20} className="uvt-option-check" aria-hidden="true" />
        </button>)}
      </div>
    </section>

    {university && source ? <>
      <section className="uvt-card" aria-labelledby="exam-how-title">
        <h2 id="exam-how-title" className="uvt-h2-sm">How {university.name} holds online exams</h2>
        <ul className="uvt-exam-points">{university.howHeld.map(point => <li key={point}>{point}</li>)}</ul>
        <h3 className="uvt-finder-h3">What your computer needs</h3>
        <dl className="uvt-mode-facts uvt-exam-reqs">{university.requirements.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
        <h3 className="uvt-finder-h3">Rules to know</h3>
        <ul className="uvt-exam-points">{university.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
        <p className="uvt-source">Source: <a href={source.url} target="_blank" rel="noopener noreferrer" className="uv-link">{source.label}<ExternalLink size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>, updated {source.updated}; read {formatCheckedDate(source.checkedAt)}. Confirm the requirements for your exam cycle with the university.</p>
      </section>

      <section className="uvt-card" aria-labelledby="exam-device-title" aria-live="polite">
        <h2 id="exam-device-title" className="uvt-h2-sm">2. Check this computer</h2>
        <p className="uvt-help-text">Run this on the computer you&apos;ll use for the exam. It reads what your browser reports; nothing is saved or sent.</p>
        <ul className="uvt-exam-checks">{checks.map(check => <li key={check.id}>
          <div className="uvt-exam-check-head"><strong>{check.label}</strong><span className={`uvt-status ${STATUS[check.status].tone}`}>{STATUS[check.status].label}</span></div>
          <p>{check.detail}</p>
        </li>)}</ul>

        <h3 className="uvt-finder-h3">Camera and microphone</h3>
        <p className="uvt-help-text">Your browser will ask for permission. The preview stays on this screen; nothing is recorded or sent, and both turn off when you stop or leave the page.</p>
        <div className="uvt-exam-media">
          <video ref={video} className="uvt-exam-video" muted playsInline aria-label="Camera preview" hidden={media.state !== "on"} />
          {media.state === "on" ? <div className="uvt-exam-media-result">
            {media.camera ? <div className="uvt-exam-check-head"><strong>Camera</strong><span className={`uvt-status ${STATUS[media.camera.status].tone}`}>{STATUS[media.camera.status].label}</span></div> : null}
            {media.camera ? <p>{media.camera.detail}</p> : null}
            <div className="uvt-exam-check-head"><strong>Microphone</strong><span className={`uvt-status ${(media.level || 0) > 0.05 ? "is-success" : "is-neutral"}`}>{(media.level || 0) > 0.05 ? "Hearing you" : "Say something"}</span></div>
            <div className="uvt-exam-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((media.level || 0) * 100)}><span style={{ width: `${Math.min(100, Math.round((media.level || 0) * 100))}%` }} /></div>
          </div> : null}
          {media.state === "error" ? <p className="uvt-error" role="alert">{media.message}</p> : null}
        </div>
        <div className="uvt-mode-actions">
          {media.state === "on"
            ? <button type="button" className="btn secondary" onClick={stop}>Stop camera and microphone</button>
            : <button type="button" className="btn secondary" onClick={startMedia} disabled={media.state === "starting"}>{media.state === "starting" ? "Starting…" : "Test camera and microphone"}</button>}
          <Link href="/lead?intent=exam-check" rel="nofollow" data-open-lead className="btn primary">Apply now</Link>
        </div>
      </section>
    </> : <p className="uvt-help-text">Choose a university to see how its exams work and check this computer against its requirements.</p>}
  </div>;
}

function stopTracks(stream: { current: MediaStream | null }, audio: { current: { context: AudioContext; frame: number } | null }) {
  stream.current?.getTracks().forEach(track => track.stop());
  stream.current = null;
  if (audio.current) { cancelAnimationFrame(audio.current.frame); audio.current.context.close().catch(() => {}); audio.current = null; }
}
