# BetterFarm Admin Portal TODO

## Infrastructure
- [x] Database schema (users, farms, posts, reports, tickets, activity logs, AI interactions, disease detections, marketplace listings, feature flags)
- [x] Backend routers (admin-protected procedures for all entities)
- [x] Core layout with sidebar navigation (6 sections, 16 pages)
- [x] Authentication guard (admin-only access via adminProcedure middleware)
- [x] Vitest unit tests (5 passing)

## Pages
- [x] Dashboard - KPI cards, charts, recent users, recent tickets
- [x] Users - list, search, role management (promote/demote), delete
- [x] Farms - farm/crop data visibility, verification status
- [x] Verification - badge request review with approve/reject workflow
- [x] AI Oversight - AI interaction monitoring with success/fail stats
- [x] Disease Detection - AI scan results with resolve workflow
- [x] Moderation - content review (posts + listings) with remove/restore
- [x] Community - forum post management with remove/restore
- [x] Marketplace - listing management with remove/restore
- [x] Reports - user report management with resolve/dismiss
- [x] Support - ticket management with status/priority filtering and notes
- [x] Revenue - marketplace financial metrics and category breakdown
- [x] Analytics - time-series charts (user growth, posts, tickets, detections)
- [x] System Health - service status monitoring with live stats
- [x] Activity Logs - complete audit trail of all admin actions
- [x] Settings - feature flags management with live toggle
