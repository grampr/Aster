import { describe, expect, it } from "vitest";
import { buildRolePatch, canEditRole, effectivePermissions, hasPermission, highestRolePosition, Permission, reorderRoles } from "./permissions";
import type { Guild, GuildMember, Role } from "../auth/types";

const guild = { id: "g", owner_id: "owner" } as Guild;
const member = (id: string, roleIds: string[] = []) => ({ user: { id }, role_ids: roleIds }) as GuildMember;
const role = (id: string, permissions: number, position: number, managed = false) => ({ id, permissions, position, managed }) as Role;
const everyone = role("everyone", Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES, 0, true);
const moderator = role("mod", Permission.MANAGE_MESSAGES | Permission.CREATE_INVITE, 2);

describe("effectivePermissions", () => {
  it("gives the owner every permission", () => {
    const bits = effectivePermissions(guild, member("owner"), [everyone]);
    for (const permission of Object.values(Permission)) expect(hasPermission(bits, permission)).toBe(true);
  });

  it("combines the default role with the assigned roles only", () => {
    const bits = effectivePermissions(guild, member("bob", ["mod"]), [everyone, moderator, role("other", Permission.MANAGE_GUILD, 3)]);
    expect(hasPermission(bits, Permission.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(bits, Permission.CREATE_INVITE)).toBe(true);
    expect(hasPermission(bits, Permission.MANAGE_GUILD)).toBe(false);
  });

  it("grants nothing without a guild or member", () => {
    expect(effectivePermissions(undefined, member("bob"), [everyone])).toBe(0);
    expect(effectivePermissions(guild, undefined, [everyone])).toBe(0);
  });

  it("requires every requested bit", () => {
    expect(hasPermission(Permission.VIEW_CHANNEL, Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES)).toBe(false);
  });
});


describe("role editing helpers", () => {
  const roles = [role("everyone", 1, 0, true), role("helper", 2, 1), moderator];

  it("ranks the owner above everyone and others by their highest role", () => {
    expect(highestRolePosition(guild, member("owner"), roles)).toBe(Number.POSITIVE_INFINITY);
    expect(highestRolePosition(guild, member("bob", ["helper"]), roles)).toBe(1);
    expect(highestRolePosition(guild, member("bob", ["helper", "mod"]), roles)).toBe(2);
    expect(highestRolePosition(guild, member("bob"), roles)).toBe(0);
    expect(highestRolePosition(undefined, member("bob"), roles)).toBe(0);
  });

  it("lets a member edit only unmanaged roles below their own", () => {
    expect(canEditRole(roles[1], 2)).toBe(true);
    expect(canEditRole(moderator, 2)).toBe(false);
    expect(canEditRole(roles[0], Number.POSITIVE_INFINITY)).toBe(false);
    expect(canEditRole(moderator, Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("builds a patch of only the changed fields", () => {
    const base = { ...moderator, name: "Mod", color: "#ff0000" } as Role;
    expect(buildRolePatch(base, { name: " Mod ", color: "#ff0000", permissions: base.permissions })).toBeNull();
    expect(buildRolePatch(base, { name: "Moderator", color: null, permissions: base.permissions })).toEqual({ name: "Moderator", color: null });
    expect(buildRolePatch(base, { name: "Mod", color: "#ff0000", permissions: Permission.MANAGE_GUILD })).toEqual({ permissions: Permission.MANAGE_GUILD });
  });

  it("only ever patches the permissions of a managed role", () => {
    const managed = role("everyone", Permission.SEND_MESSAGES, 0, true);
    expect(buildRolePatch(managed, { name: "renamed", color: "#000000", permissions: managed.permissions })).toBeNull();
    expect(buildRolePatch(managed, { name: "renamed", color: "#000000", permissions: 0 })).toEqual({ permissions: 0 });
  });
});

describe("reorderRoles", () => {
  const roles = [role("everyone", 1, 0, true), role("a", 1, 1), role("b", 1, 2), role("c", 1, 3), role("boss", 1, 4)];

  it("moves a role and renumbers only the roles that changed", () => {
    // Editable below position 4, highest first: c(3) b(2) a(1). Move a to the top.
    expect(reorderRoles(roles, 4, "a", 0)).toEqual([{ id: "a", position: 3 }, { id: "c", position: 2 }, { id: "b", position: 1 }]);
  });

  it("returns nothing when the order does not change or the role is not editable", () => {
    expect(reorderRoles(roles, 4, "c", 0)).toEqual([]);
    expect(reorderRoles(roles, 4, "boss", 0)).toEqual([]);
    expect(reorderRoles(roles, 4, "a", 9)).toEqual([]);
  });

  it("lets the owner reorder every non-default role", () => {
    expect(reorderRoles(roles, Number.POSITIVE_INFINITY, "a", 0)).toEqual([{ id: "a", position: 4 }, { id: "boss", position: 3 }, { id: "c", position: 2 }, { id: "b", position: 1 }]);
  });
});
