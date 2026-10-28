/** Allowlisted Polarch tables. Names and columns never come from the client. */

export type TableName =
  | "profiles"
  | "capacities"
  | "domains"
  | "managers"
  | "teams"
  | "people"
  | "actions"
  | "meetings"
  | "tags"
  | "topics"
  | "follow_ups"
  | "one_on_ones"
  | "goals"
  | "notes"
  | "wins"
  | "prayers"
  | "team_actions"
  | "team_goals"
  | "team_notes"
  | "chats"
  | "node_positions"
  | "arcs"
  | "arc_takeaways"
  | "shared_notes"
  | "glossary"
  | "fixtures"
  | "knowledge";

export const TABLE_KEY: Record<TableName, string> = {
  profiles: "user_id",
  capacities: "id",
  domains: "id",
  managers: "id",
  teams: "id",
  people: "id",
  actions: "id",
  meetings: "id",
  tags: "id",
  topics: "id",
  follow_ups: "id",
  one_on_ones: "id",
  goals: "id",
  notes: "id",
  wins: "id",
  prayers: "id",
  team_actions: "id",
  team_goals: "id",
  team_notes: "id",
  chats: "chat_key",
  node_positions: "node_id",
  arcs: "id",
  arc_takeaways: "id",
  shared_notes: "id",
  glossary: "id",
  fixtures: "id",
  knowledge: "id",
};

export const TABLE_COLUMNS: Record<TableName, readonly string[]> = {
  profiles: [
    "user_id",
    "name",
    "title",
    "photo",
    "clifton_top5",
    "enneagram",
    "mbti",
    "strengths",
    "watch_outs",
    "how_to_lead",
    "custom_modalities",
    "updated_at",
  ],
  capacities: ["user_id", "id", "label", "color"],
  domains: ["user_id", "id", "name", "color"],
  managers: [
    "user_id",
    "id",
    "name",
    "role",
    "domain_id",
    "photo",
    "no_meeting",
    "prayer",
    "lead_up",
  ],
  teams: [
    "user_id",
    "id",
    "name",
    "capacity_id",
    "domain_id",
    "health",
    "prayer",
    "description",
    "purpose",
    "cadence",
    "last_met",
    "no_meeting",
    "sort_order",
    "direction",
    "parent_id",
    "leader_id",
  ],
  people: [
    "user_id",
    "id",
    "team_id",
    "domain_id",
    "name",
    "role",
    "photo",
    "health",
    "prayer",
    "relationship_type",
    "no_meeting",
    "clifton_top5",
    "enneagram",
    "mbti",
    "strengths",
    "watch_outs",
    "how_to_lead",
    "custom_modalities",
    "lead_up",
    "email",
  ],
  actions: ["user_id", "id", "person_id", "text", "done", "due_date", "board_column"],
  meetings: [
    "user_id",
    "id",
    "subject_kind",
    "subject_id",
    "name",
    "rhythm",
    "floor_days",
    "next_date",
    "anchor_weekday",
    "role",
    "tracker_url",
    "tracker_name",
    "curriculum",
    "coverage_targets",
  ],
  tags: ["user_id", "id", "label", "color", "sort_order"],
  topics: [
    "user_id",
    "id",
    "meeting_id",
    "text",
    "detail",
    "tag_ids",
    "urgent",
    "points",
    "returned_on",
    "returned_from_date",
    "carried_from",
    "status",
    "lane",
    "session_id",
    "carried",
    "due_date",
    "created_on",
    "closed_on",
    "sort_order",
    "slot_id",
    "is_private",
    "raised_by",
  ],
  follow_ups: [
    "user_id",
    "id",
    "subject_kind",
    "subject_id",
    "meeting_id",
    "text",
    "status",
    "opened_on",
    "closed_on",
    "source_session_id",
    "sort_order",
    "owner",
    "is_private",
  ],
  one_on_ones: [
    "user_id",
    "id",
    "person_id",
    "meeting_id",
    "date",
    "uncovered",
    "point",
    "notes",
    "next_date",
    "transcript",
    "series_date",
    "occurrence_kind",
  ],
  goals: ["user_id", "id", "person_id", "title", "progress", "target_date"],
  notes: ["user_id", "id", "person_id", "date", "body"],
  wins: ["user_id", "id", "person_id", "date", "text", "impact"],
  prayers: [
    "user_id",
    "id",
    "subject_kind",
    "subject_id",
    "date",
    "kind",
    "text",
    "answered_on",
    "answer_note",
  ],
  team_actions: ["user_id", "id", "team_id", "text", "done", "due_date"],
  team_goals: ["user_id", "id", "team_id", "title", "progress", "target_date"],
  team_notes: ["user_id", "id", "team_id", "date", "body"],
  chats: ["user_id", "chat_key", "messages"],
  node_positions: ["user_id", "node_id", "x", "y"],
  arcs: [
    "user_id",
    "id",
    "meeting_id",
    "title",
    "author",
    "cover",
    "cover_url",
    "slot_id",
    "pace_every",
    "starts_on",
    "status",
    "steps",
    "passed_in",
    "created_on",
    "closed_on",
    "sort_order",
  ],
  arc_takeaways: ["user_id", "id", "arc_id", "step_id", "by_member", "text", "taken_on"],
  shared_notes: ["user_id", "id", "meeting_id", "session_id", "by_member", "body", "updated_on"],
  glossary: ["user_id", "id", "heard", "meant", "created_on"],
  fixtures: [
    "user_id",
    "id",
    "subject_kind",
    "subject_id",
    "title",
    "owner",
    "cadence",
    "notes",
    "last_touched_on",
    "created_on",
    "sort_order",
  ],
  knowledge: [
    "user_id",
    "id",
    "subject_kind",
    "subject_id",
    "kind",
    "text",
    "session_id",
    "noted_on",
    "pinned",
  ],
};

export const JSON_COLUMNS = new Set([
  "clifton_top5",
  "strengths",
  "watch_outs",
  "custom_modalities",
  "health",
  "prayer",
  "lead_up",
  "curriculum",
  "coverage_targets",
  "points",
  "messages",
  "steps",
]);

export const TEXT_ARRAY_COLUMNS = new Set(["tag_ids", "carried_from", "uncovered", "passed_in"]);

export const ALL_TABLES = Object.keys(TABLE_COLUMNS) as TableName[];

export const DATA_TABLES = ALL_TABLES.filter((t) => t !== "profiles");

export function isTableName(value: string): value is TableName {
  return value in TABLE_COLUMNS;
}
