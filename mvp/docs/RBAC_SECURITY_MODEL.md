# Facility RBAC security model

## Effective authorization

For a normal Facility staff request:

`authenticated active account + ACTIVE staff membership + ACTIVE same-Facility bundle + permission + resource relationship/state policy`

A Facility staff role name is not itself authority.

## Trust boundaries
- Client role/permission claims are ignored.
- Facility ID in the URL is treated as an input to authorize, not proof of scope.
- Permission codes come from canonical database definitions.
- Membership and bundle state are evaluated server-side on every fresh session-context load.
- Platform-only permissions cannot be delegated through Facility bundles.

## Platform oversight
`admin.oversight` is a separate internal Medidocta capability. It is never delegatable to Facility bundles.

## Why no write API yet
The technical system can represent bundles and memberships, but Medidocta has not approved DR-002/DR-016. Exposing self-service role creation, invitations, assignments, or default Reception/Finance/Admin roles would silently create business policy. This milestone therefore implements and tests the authorization substrate and read surfaces while leaving mutations behind an explicit product-decision gate.
