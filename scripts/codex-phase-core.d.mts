/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ParsedPrompt {
  readonly number: number;
  readonly filename: string;
  readonly task: string;
  readonly taskPhase: number;
  readonly title: string;
  readonly recommendation: string;
  readonly model: string;
  readonly reasoning: string;
  readonly targetVersion: string;
  readonly kind: 'implementation' | 'closeout';
  readonly text: string;
}

export interface PhasePlan {
  readonly phase: number;
  readonly folderName: string;
  readonly prompts: readonly [ParsedPrompt, ...ParsedPrompt[]];
  readonly implementations: readonly ParsedPrompt[];
  readonly closeout: ParsedPrompt;
}

export const MODEL_CONFIGS: Readonly<
  Record<string, Readonly<{ model: string; reasoning: string }>>
>;

export function resolveModelConfig(recommendation: string): {
  readonly model: string;
  readonly reasoning: string;
};
export function parsePrompt(filename: string, text: string): ParsedPrompt;
export function buildPlan(
  entries: readonly { filename: string; text: string }[],
  folderName: string,
): PhasePlan;
export function assertVersionCompatible(...arguments_: any[]): any;
export function assertPostPrompt(...arguments_: any[]): any;
export function interpretEvent(...arguments_: any[]): any;
export function createEventTracker(...arguments_: any[]): any;
export function applyEventObservation(...arguments_: any[]): any;
export function createStructuredEventProcessor(...arguments_: any[]): any;
export function printableAscii(...arguments_: any[]): any;
export function style(...arguments_: any[]): any;
export function stripAnsi(...arguments_: any[]): any;
export function formatElapsed(...arguments_: any[]): any;
export function formatUsage(...arguments_: any[]): any;
export function renderDashboard(...arguments_: any[]): any;
export function isColorEnabled(...arguments_: any[]): any;
export function createDisplaySession(...arguments_: any[]): any;
export function startElapsedRedraw(...arguments_: any[]): any;
export function renderFailureSummary(...arguments_: any[]): any;
export function renderSuccessHandoff(...arguments_: any[]): any;
export function hasCursorControls(...arguments_: any[]): any;
export function isAscii(...arguments_: any[]): any;
