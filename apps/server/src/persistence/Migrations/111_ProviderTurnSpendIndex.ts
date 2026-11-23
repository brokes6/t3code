import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE INDEX orchestration_v2_provider_turn_spend_idx
    ON orchestration_v2_projection_provider_turns(provider_thread_id, completed_at)
    WHERE completed_at IS NOT NULL AND status IN ('completed', 'failed', 'interrupted', 'cancelled')
  `;
});
