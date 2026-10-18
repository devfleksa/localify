"use client";

import { useState } from "react";
import { AlertDialog, DropdownMenu } from "radix-ui";
import { ChevronDown, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadImage, downloadZip, fileName } from "@/lib/download";
import { market } from "@/lib/markets";
import { cn } from "@/lib/utils";
import type { MarketCode } from "@/lib/markets";
import type { Message } from "@/lib/types";
import { IS_SHOWCASE } from "@/lib/showcase";

type ResultsMessage = Extract<Message, { kind: "results" }>;
export type SlideRef = { market: MarketCode; slide: number }; // slide is 1-based

// Slides the AI changed (result differs from the original); unchanged slides are never downloaded or regenerated in bulk.
export function editedSlides(message: ResultsMessage, code?: MarketCode): SlideRef[] {
  const originals = message.originalImages ?? [];
  return message.results
    .filter((r) => !code || r.market === code)
    .flatMap((r) =>
      (r.imageUrls ?? []).flatMap((u, i) => (u && u !== originals[i] ? [{ market: r.market, slide: i + 1 }] : [])),
    );
}

type Option = { label: string; run: () => void; disabled?: boolean };
type Level = Option & { items: SlideRef[]; show: boolean };

// The first option (this slide) always stays; a wider scope is only offered when it adds slides the narrower ones don't cover.
function scopes(levels: Level[]): Option[] {
  const seen = new Set<string>();
  return levels
    .filter((l, i) => {
      if (!l.show) return false;
      const keys = l.items.map((s) => `${s.market}-${s.slide}`);
      const adds = keys.some((k) => !seen.has(k));
      keys.forEach((k) => seen.add(k));
      return i === 0 || adds;
    })
    .map(({ label, run, disabled }) => ({ label, run, disabled }));
}

function Menu({ trigger, options }: { trigger: React.ReactNode; options: Option[] }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[60] min-w-56 rounded-xl bg-lift p-1 text-sm shadow-lg shadow-black/40 animate-in fade-in-0 zoom-in-95" /* taste-skill-ignore: a dropdown menu floats, so it may cast a shadow */
        >
          {options.map((o) => (
            <DropdownMenu.Item
              key={o.label}
              disabled={o.disabled}
              onSelect={o.run}
              className="cursor-default rounded-lg px-3 py-2 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent"
            >
              {o.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// Download: this slide, the edited slides of this market (.zip), or the edited slides of every market (.zip, a folder per market).
export function DownloadMenu({
  message,
  handle,
  code,
  slide,
  disabled,
  big,
}: {
  message: ResultsMessage;
  handle: string;
  code: MarketCode;
  slide: number;
  disabled?: boolean; // "this slide" can't be downloaded
  big?: boolean; // labelled button (full-screen viewer) instead of an icon
}) {
  const count = message.originalImages?.length ?? 0;
  const r = message.results.find((x) => x.market === code);
  const url = r?.imageUrls?.[slide - 1] ?? message.originalImages?.[slide - 1];
  const m = market(code);
  const file = (s: SlideRef) => fileName(handle, s.market, s.slide, count);
  const urlOf = (s: SlideRef) => message.results.find((x) => x.market === s.market)!.imageUrls![s.slide - 1];

  const one = () => url && downloadImage(url, fileName(handle, code, slide, count));
  const inMarket = editedSlides(message, code);
  const all = editedSlides(message);
  const options = scopes([
    { label: count > 1 ? "This slide" : "This image", items: [{ market: code, slide }], show: true, run: one, disabled: disabled || !url },
    {
      label: `Edited slides · ${m.flag} ${m.name} (${inMarket.length})`,
      items: inMarket,
      show: count > 1,
      run: () => downloadZip(inMarket.map((s) => ({ url: urlOf(s), path: file(s) })), `${handle}-${code.toLowerCase()}`),
    },
    {
      label: `Edited ${count > 1 ? "slides" : "images"} · all markets (${all.length})`,
      items: all,
      show: message.results.length > 1,
      run: () => downloadZip(all.map((s) => ({ url: urlOf(s), path: `${s.market.toLowerCase()}/${file(s)}` })), `${handle}-all-markets`),
    },
  ]);

  const button = (props: React.ComponentProps<typeof Button>) =>
    big ? (
      <Button size="sm" variant="secondary" {...props}>
        <Download /> Download {options.length > 1 && <ChevronDown className="-mr-0.5 opacity-70" />}
      </Button>
    ) : (
      <Button size="icon-sm" variant="ghost" aria-label="Download" title="Download" {...props}>
        <Download />
      </Button>
    );

  if (options.length === 1) return button({ disabled: options[0].disabled, onClick: one });
  return <Menu trigger={button({})} options={options} />;
}

// Regenerate: this slide, every edited slide of this market, or every edited slide of every market.
// More than one slide asks first, since each one is a paid image edit.
export function RegenerateMenu({
  message,
  code,
  slide,
  isPending,
  onRegenerate,
}: {
  message: ResultsMessage;
  code: MarketCode;
  slide: number;
  isPending: (s: SlideRef) => boolean;
  onRegenerate: (slides: SlideRef[]) => void;
}) {
  const [confirm, setConfirm] = useState<SlideRef[] | null>(null);
  const count = message.originalImages?.length ?? 0;
  const m = market(code);
  const free = (s: SlideRef) => !isPending(s);
  const here = editedSlides(message, code).filter((s) => s.slide === slide && free(s));
  const inMarket = editedSlides(message, code).filter(free);
  const all = editedSlides(message).filter(free);
  const busy = isPending({ market: code, slide });

  // The replay skips the "paid edits" question: nothing is paid there, the click only shows the read-only hint.
  const run = (slides: SlideRef[]) => (slides.length > 1 && !IS_SHOWCASE ? setConfirm(slides) : onRegenerate(slides));
  const level = (label: string, items: SlideRef[], show: boolean): Level => ({ label, items, show, run: () => run(items), disabled: !items.length });
  const options = scopes([
    level(count > 1 ? "This slide" : "This image", here, true),
    level(`Edited slides · ${m.flag} ${m.name} (${inMarket.length})`, inMarket, count > 1),
    level(`Edited ${count > 1 ? "slides" : "images"} · all markets (${all.length})`, all, message.results.length > 1),
  ]);
  if (!options.some((o) => !o.disabled) && !busy) return null;

  const icon = <RefreshCw className={cn(busy && "animate-spin")} />;
  const markets = new Set(confirm?.map((s) => s.market)).size;

  return (
    <>
      {options.length === 1 ? (
        <Button size="sm" variant="ghost" disabled={options[0].disabled} onClick={options[0].run}>
          {icon} Regenerate
        </Button>
      ) : (
        <Menu
          options={options}
          trigger={
            <Button size="sm" variant="ghost">
              {icon} Regenerate <ChevronDown className="-mr-0.5 opacity-70" />
            </Button>
          }
        />
      )}
      <AlertDialog.Root open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[70] bg-black/60 animate-in fade-in-0" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-raised p-6 animate-in fade-in-0 zoom-in-95">
            <AlertDialog.Title className="text-lg font-medium">Regenerate {confirm?.length} slides?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-[15px] text-muted-foreground">
              This runs {confirm?.length} new paid image edits{markets > 1 ? ` across ${markets} markets` : ""}. The current versions are replaced.
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button onClick={() => confirm && onRegenerate(confirm)}>Regenerate {confirm?.length}</Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
