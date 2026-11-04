import type { GlobalOptions } from "./config.js";
import { loadConfig, resolveStateDir } from "./config.js";
import { ClawpatchError } from "./errors.js";
import { findProjectRoot } from "./git.js";
import { ensureStateDirs, readProject, statePaths } from "./state.js";

export type AppContext = {
  root: string;
  options: GlobalOptions;
};

export async function makeContext(options: GlobalOptions): Promise<AppContext> {
  return { root: await findProjectRoot(process.cwd(), options.root), options };
}

export async function loadProjectState(context: AppContext) {
  const config = await loadConfig(context.root, context.options);
  const paths = statePaths(resolveStateDir(context.root, config));
  const project = await readProject(paths);
  if (project === null) {
    throw new ClawpatchError("not initialized; run clawpatch init", 2, "not-initialized");
  }
  await ensureStateDirs(paths);
  return { root: context.root, config, paths, project };
}

export type LoadedProjectState = Awaited<ReturnType<typeof loadProjectState>>;
