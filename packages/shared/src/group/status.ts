/** Group lifecycle types sourced from the protobuf contract for both clients. */

import { GroupStatus } from "@haalkhata/protogen/group/v1/group_pb";

/** The canonical lifecycle enum; no client maintains a separate set of values. */
export { GroupStatus };

/** Lifecycle states supported by the archive and restore controls. */
export type GroupArchiveStatus = GroupStatus.ACTIVE | GroupStatus.ARCHIVED;
