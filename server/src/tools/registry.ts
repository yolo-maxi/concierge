import { captureLeadTool } from "./captureLead.js";
import { handoffHumanTool } from "./handoffHuman.js";
import type { ConciergeTool } from "./types.js";

const ALL_TOOLS: ConciergeTool[] = [captureLeadTool, handoffHumanTool];
const REGISTRY = new Map(ALL_TOOLS.map((tool) => [tool.name, tool]));

export function getAllowedTools(names: string[] | undefined): ConciergeTool[] {
  if (!Array.isArray(names) || names.length === 0) return [];
  const tools: ConciergeTool[] = [];
  for (const name of names) {
    const tool = REGISTRY.get(name);
    if (tool) tools.push(tool);
  }
  return tools;
}

export function getTool(name: string): ConciergeTool | undefined {
  return REGISTRY.get(name);
}
