import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type UserRow = {
  id: string;
  username: string | null;
  email: string | null;
  specialty: string | null;
  profile_image_url: string | null;
};

type StaffUnavailabilityRow = {
  user_id: string;
  unavailable_date?: string | null;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  status?: string | null;
};

function getManilaToday() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(now);
}

function toDateOnly(value?: string | null) {
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isUnavailableToday(row: StaffUnavailabilityRow, today: string) {
  const directDate = toDateOnly(row.unavailable_date || row.date || null);

  if (directDate && directDate === today) return true;

  const startDate = toDateOnly(row.start_date || row.start_datetime || null);
  const endDate = toDateOnly(row.end_date || row.end_datetime || null);

  if (startDate && endDate) {
    return today >= startDate && today <= endDate;
  }

  if (startDate && startDate === today) return true;

  return false;
}

export async function GET() {
  try {
    const today = getManilaToday();

    const { data: users, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, username, email, specialty, profile_image_url")
      .eq("role", "staff")
      .eq("status", "active")
      .order("username", { ascending: true });

    if (usersError) {
      console.log("getActiveStaffAvailability users error:", usersError);

      return NextResponse.json(
        {
          error: "Failed to fetch active staff.",
          details: usersError.message,
        },
        { status: 500 },
      );
    }

    const staff = (users ?? []) as UserRow[];
    const staffIds = staff.map((user) => user.id);

    if (staffIds.length === 0) {
      return NextResponse.json({
        employees: [],
        meta: {
          today,
          source: "staff_unavailability",
        },
      });
    }

    const { data: unavailableRows, error: unavailableError } =
      await supabaseAdmin
        .from("staff_unavailability")
        .select("*")
        .in("user_id", staffIds);

    if (unavailableError) {
      console.log(
        "getActiveStaffAvailability staff_unavailability error:",
        unavailableError,
      );

      return NextResponse.json(
        {
          error: "Failed to fetch staff unavailability.",
          details: unavailableError.message,
        },
        { status: 500 },
      );
    }

    const unavailableTodayIds = new Set(
      ((unavailableRows ?? []) as StaffUnavailabilityRow[])
        .filter((row) => isUnavailableToday(row, today))
        .map((row) => row.user_id),
    );

    const employees = staff.map((user) => {
      const unavailableToday = unavailableTodayIds.has(user.id);

      return {
        id: user.id,
        name: user.username || user.email || "Unnamed Staff",
        role: user.specialty || "Staff",
        avatarUrl: user.profile_image_url,
        status: unavailableToday ? "Unavailable" : "Available",
      };
    });

    console.log("getActiveStaffAvailability result:", {
      today,
      staffCount: staff.length,
      unavailableTodayCount: unavailableTodayIds.size,
    });

    return NextResponse.json({
      employees,
      meta: {
        today,
        source: "staff_unavailability",
      },
    });
  } catch (error) {
    console.log("getActiveStaffAvailability unexpected error:", error);

    return NextResponse.json(
      {
        error: "Unexpected error while fetching staff availability.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
