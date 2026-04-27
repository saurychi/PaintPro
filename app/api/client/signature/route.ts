import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const COOKIE_NAME = "paintpro_client_project_id";
const BUCKET = "signatures";

async function getProjectId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export async function GET() {
  const projectId = await getProjectId();
  if (!projectId)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const signaturePath = `client-signatures/${projectId}.png`;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(signaturePath, 60);

  if (error) return NextResponse.json({ signedUrl: null });

  return NextResponse.json({ signedUrl: data.signedUrl });
}

export async function POST(request: NextRequest) {
  const projectId = await getProjectId();
  if (!projectId)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file)
    return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const signaturePath = `client-signatures/${projectId}.png`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(signaturePath, buffer, { contentType: "image/png", upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { error: "Failed to save signature.", details: uploadError.message },
      { status: 500 },
    );
  }

  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(signaturePath, 60);

  return NextResponse.json({
    success: true,
    signedUrl: signedError ? null : signedData.signedUrl,
  });
}
