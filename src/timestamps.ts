/** Portable Obsidian note timestamps. Values are always ISO-8601 UTC (Zulu). */
export const CREATED_AT_FIELD = "created_at";
export const UPDATED_AT_FIELD = "updated_at";
export function isoZulu(value: number | Date = Date.now()): string { const date=value instanceof Date?value:new Date(value); if(!Number.isFinite(date.getTime()))throw new Error("Invalid timestamp"); return date.toISOString(); }
export function applyNoteTimestamps(frontmatter:Record<string,unknown>,createdMs:number,modifiedMs:number):boolean{
  // OKF+ 2.2 intentionally stays compact and editable in Obsidian Properties.
  // Its `timestamp` is the stable event/creation time; do not re-inject the
  // beta.10 created_at/updated_at pair on every human edit.
  if(frontmatter.okf_version==="2.2"){
    if(typeof frontmatter.timestamp==="string"&&frontmatter.timestamp)return false;
    frontmatter.timestamp=isoZulu(createdMs);return true;
  }
  let changed=false;
  if(typeof frontmatter[CREATED_AT_FIELD]!=="string"||!frontmatter[CREATED_AT_FIELD]){frontmatter[CREATED_AT_FIELD]=isoZulu(createdMs);changed=true;}
  const updated=isoZulu(modifiedMs);
  if(frontmatter[UPDATED_AT_FIELD]!==updated){frontmatter[UPDATED_AT_FIELD]=updated;changed=true;}
  return changed;
}
export function timestampEligible(path:string,extension:string):boolean{const normalized=path.replace(/\\/g,"/").toLowerCase();return extension.toLowerCase()==="md"&&!normalized.startsWith(".obsidian/")&&!normalized.startsWith(".okf/");}
