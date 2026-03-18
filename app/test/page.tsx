import { createClient } from "@supabase/supabase-js";

export default async function TestPage() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase.from("_test").select("*").limit(1);

    return (
        <div style={{ padding: 40 }}>
            <h1>Supabase connection test</h1>
            {error?.code === "42P01" ? (
                <p style={{ color: "green" }}>✅ Connected — Supabase is working</p>
            ) : error ? (
                <p style={{ color: "red" }}>❌ Error: {error.message}</p>
            ) : (
                <p style={{ color: "green" }}>✅ Connected</p>
            )}
        </div>
    );
}
