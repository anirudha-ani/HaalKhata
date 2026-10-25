/**
 * Typed Connect clients for the operator's admin page. Import from the
 * admin page only: they sit apart from connect.ts so the app's pages, which
 * all import that file, do not ship the admin services' definitions to
 * every visitor.
 */

import { createClient } from "@connectrpc/connect";
import { AdminAnalyticsService } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { AdminModerationService } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";
import { transport } from "@/lib/api/connect";

/**
 * Typed client for the operator's usage overview. The service answers only
 * on the admin hostname; from the app's own origin every call is a 404.
 */
export const adminAnalyticsClient = createClient(AdminAnalyticsService, transport);
/**
 * Typed client for the operator's report queue and its actions. Like the
 * usage overview, it answers only on the admin hostname.
 */
export const adminModerationClient = createClient(AdminModerationService, transport);
