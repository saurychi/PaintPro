import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function dataUrlToBuffer(dataUrl: string) {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);

  if (!matches) {
    throw new Error("Invalid signature image format.");
  }

  const mimeType = matches[1];
  const base64 = matches[2];
  const buffer = Buffer.from(base64, "base64");

  return { buffer, mimeType };
}

async function getUserFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    throw new Error("Missing authorization token.");
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Invalid or expired session.");
  }

  return data.user;
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("id, role, signature_url")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
      return NextResponse.json(
        { error: "User profile was not found." },
        { status: 404 },
      );
    }

    if (!profile.signature_url) {
      return NextResponse.json({
        signaturePath: null,
        signedUrl: null,
      });
    }

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from("signatures")
      .createSignedUrl(profile.signature_url, 60);

    if (signedError) throw signedError;

    return NextResponse.json({
      signaturePath: profile.signature_url,
      signedUrl: signedData.signedUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to load signature.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    const body = await request.json();

    const signatureDataUrl =
      typeof body?.signatureDataUrl === "string"
        ? body.signatureDataUrl.trim()
        : "";

    if (!signatureDataUrl) {
      return NextResponse.json(
        { error: "Missing signature image." },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
      return NextResponse.json(
        { error: "User profile was not found." },
        { status: 404 },
      );
    }

    if (!["admin", "manager"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Only admins or managers can save document signatures." },
        { status: 403 },
      );
    }

    const { buffer, mimeType } = dataUrlToBuffer(signatureDataUrl);

    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimeType)) {
      return NextResponse.json(
        { error: "Signature must be a PNG, JPEG, or WEBP image." },
        { status: 400 },
      );
    }

    const signaturePath = `admin-signatures/${user.id}.png`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("signatures")
      .upload(signaturePath, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        signature_url: signaturePath,
        signature_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) throw updateError;

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from("signatures")
      .createSignedUrl(signaturePath, 60);

    if (signedError) throw signedError;

    return NextResponse.json({
      message: "Signature saved.",
      signaturePath,
      signedUrl: signedData.signedUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to save signature.",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
