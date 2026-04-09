"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Contact = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  created_at: string | null;
};

type ContactForm = {
  name: string;
  email: string;
  department: string;
};

const initialForm: ContactForm = {
  name: "",
  email: "",
  department: "",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState<ContactForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function fetchContacts() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, email, department, created_at")
      .order("name", { ascending: true });

    if (error) {
      console.error("contacts 조회 에러:", error);
      setErrorMessage(`연락처를 불러오지 못했어요. (${error.message})`);
      setLoading(false);
      return;
    }

    setContacts((data as Contact[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchContacts();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  async function handleAddContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.name.trim() || !form.email.trim()) {
      setErrorMessage("이름과 이메일은 필수예요.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("contacts")
      .insert({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        department: form.department.trim() || null,
      });

    if (error) {
      console.error("contacts 추가 에러:", error);
      setErrorMessage(`연락처 추가에 실패했어요. (${error.message})`);
      setSubmitting(false);
      return;
    }

    setForm(initialForm);
    await fetchContacts();
    setSubmitting(false);
  }

  async function handleDeleteContact(id: string) {
    const confirmed = window.confirm("이 연락처를 삭제할까요?");
    if (!confirmed) return;

    setSubmitting(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("contacts 삭제 에러:", error);
      setErrorMessage(`연락처 삭제에 실패했어요. (${error.message})`);
      setSubmitting(false);
      return;
    }

    await fetchContacts();
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-2 text-sm text-gray-600">
            내부 연락처를 조회하고 추가/삭제하는 화면이에요.
          </p>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <form onSubmit={handleAddContact} className="grid gap-4 md:grid-cols-4">
            <input
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="이름"
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              required
            />
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="이메일"
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              required
            />
            <input
              type="text"
              value={form.department}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, department: e.target.value }))
              }
              placeholder="부서 (선택)"
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting ? "처리중..." : "추가"}
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">이메일</th>
                <th className="px-4 py-3 font-medium">부서</th>
                <th className="px-4 py-3 font-medium">삭제</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    불러오는 중...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    등록된 연락처가 없어요.
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-900">{contact.name}</td>
                    <td className="px-4 py-3 text-gray-700">{contact.email}</td>
                    <td className="px-4 py-3 text-gray-700">{contact.department || "-"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleDeleteContact(contact.id)}
                        disabled={submitting}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
