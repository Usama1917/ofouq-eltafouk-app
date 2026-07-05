import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { toEnglishDigits } from "@/lib/format";
import { addNote, deleteNote, editNote, fetchNotes, notesQueryKey, type LessonNote } from "@/lib/engagement";

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => toEnglishDigits(String(n).padStart(2, "0"));
  return h > 0 ? `${toEnglishDigits(String(h))}:${two(m)}:${two(r)}` : `${toEnglishDigits(String(m))}:${two(r)}`;
}

// v2 Phase 4 — timestamped notes under the video. Adding a note captures the last
// watched second; tapping a note's time chip seeks the player there. Private per student.
export function LessonNotes({
  lessonId,
  getCurrentSeconds,
  onSeek,
}: {
  lessonId: number;
  getCurrentSeconds: () => number;
  onSeek: (seconds: number) => void;
}) {
  const { token } = useAuth();
  const { colors, language, direction, textAlign, isRTL } = usePreferences();
  const en = language === "en";
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: notesQueryKey(lessonId),
    queryFn: () => fetchNotes(token, lessonId),
    enabled: !!token && !!lessonId,
  });
  const notes = data?.notes ?? [];

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftAt, setDraftAt] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: notesQueryKey(lessonId) });

  const startAdd = () => {
    setDraftAt(Math.max(0, Math.floor(getCurrentSeconds())));
    setDraft("");
    setAdding(true);
    setEditingId(null);
  };

  const saveNew = async () => {
    const body = draft.trim();
    if (!body || busy || !token) return;
    setBusy(true);
    try {
      await addNote(token, lessonId, draftAt, body);
      setAdding(false);
      setDraft("");
      await refresh();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: number) => {
    const body = editDraft.trim();
    if (!body || busy || !token) return;
    setBusy(true);
    try {
      await editNote(token, id, body);
      setEditingId(null);
      await refresh();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (note: LessonNote) => {
    Alert.alert(
      en ? "Delete note?" : "تمسح الملاحظة؟",
      en ? "This can't be undone." : "مش هتقدر تسترجعها.",
      [
        { text: en ? "Cancel" : "إلغاء", style: "cancel" },
        {
          text: en ? "Delete" : "حذف",
          style: "destructive",
          onPress: async () => {
            if (!token) return;
            try {
              await deleteNote(token, note.id);
              await refresh();
            } catch {
              // ignore
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.header, { direction: "ltr", flexDirection: en ? "row" : "row-reverse" }]}>
        <View style={[styles.headerLeft, { flexDirection: en ? "row" : "row-reverse" }]}>
          <Feather name="edit-3" size={17} color={COLORS.primary} />
          <Text style={[styles.title, { color: colors.text, writingDirection: direction }]}>{en ? "My notes" : "ملاحظاتي"}</Text>
          {notes.length > 0 ? (
            <View style={styles.countPill}>
              <Text style={styles.countText}>{toEnglishDigits(String(notes.length))}</Text>
            </View>
          ) : null}
        </View>
        {!adding ? (
          <Pressable onPress={startAdd} style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.85 : 1, flexDirection: en ? "row" : "row-reverse" }]}>
            <Feather name="plus" size={15} color="#fff" />
            <Text style={styles.addBtnText}>{en ? "Add note" : "أضف ملاحظة"}</Text>
          </Pressable>
        ) : null}
      </View>

      {adding ? (
        <View style={styles.addBox}>
          <View style={[styles.timeChip, { alignSelf: en ? "flex-start" : "flex-end" }]}>
            <Feather name="clock" size={12} color={COLORS.primary} />
            <Text style={styles.timeChipText}>{fmtTime(draftAt)}</Text>
          </View>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={en ? "Write your note…" : "اكتب ملاحظتك…"}
            placeholderTextColor={colors.textTertiary}
            multiline
            autoFocus
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, textAlign, writingDirection: direction }]}
          />
          <View style={[styles.addActions, { flexDirection: en ? "row" : "row-reverse" }]}>
            <Pressable onPress={() => { setAdding(false); setDraft(""); }} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{en ? "Cancel" : "إلغاء"}</Text>
            </Pressable>
            <Pressable onPress={saveNew} disabled={busy || !draft.trim()} style={[styles.saveBtn, { opacity: busy || !draft.trim() ? 0.5 : 1 }]}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{en ? "Save" : "حفظ"}</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 14 }} />
      ) : notes.length === 0 && !adding ? (
        <Text style={[styles.empty, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
          {en ? "No notes yet — jot down key moments while you watch." : "لسه مفيش ملاحظات — دوّن اللحظات المهمة وإنت بتتفرّج."}
        </Text>
      ) : (
        <View style={{ gap: 8, marginTop: notes.length ? 10 : 0 }}>
          {notes.map((note) => (
            <View key={note.id} style={[styles.note, { borderColor: colors.border, backgroundColor: colors.surface, direction: "ltr", flexDirection: en ? "row" : "row-reverse" }]}>
              <Pressable onPress={() => onSeek(note.atSeconds)} style={[styles.timeChip, styles.timeChipTappable]}>
                <Feather name="play" size={11} color={COLORS.primary} />
                <Text style={styles.timeChipText}>{fmtTime(note.atSeconds)}</Text>
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                {editingId === note.id ? (
                  <>
                    <TextInput
                      value={editDraft}
                      onChangeText={setEditDraft}
                      multiline
                      autoFocus
                      style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card, textAlign, writingDirection: direction }]}
                    />
                    <View style={[styles.addActions, { flexDirection: en ? "row" : "row-reverse", marginTop: 6 }]}>
                      <Pressable onPress={() => setEditingId(null)} style={styles.cancelBtn}>
                        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{en ? "Cancel" : "إلغاء"}</Text>
                      </Pressable>
                      <Pressable onPress={() => saveEdit(note.id)} disabled={busy || !editDraft.trim()} style={[styles.saveBtn, { opacity: busy || !editDraft.trim() ? 0.5 : 1 }]}>
                        <Text style={styles.saveText}>{en ? "Save" : "حفظ"}</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Text style={[styles.noteBody, { color: colors.text, textAlign, writingDirection: direction }]}>{note.body}</Text>
                )}
              </View>
              {editingId !== note.id ? (
                <View style={[styles.noteActions, { flexDirection: en ? "row" : "row-reverse" }]}>
                  <Pressable onPress={() => { setEditingId(note.id); setEditDraft(note.body); }} hitSlop={6}>
                    <Feather name="edit-2" size={15} color={colors.textTertiary} />
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(note)} hitSlop={6}>
                    <Feather name="trash-2" size={15} color="#DC2626" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, borderWidth: 1, padding: 14, marginTop: 12 },
  header: { alignItems: "center", justifyContent: "space-between" },
  headerLeft: { alignItems: "center", gap: 8 },
  title: { ...FONT.bold, fontSize: 15 },
  countPill: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: COLORS.primary + "1A", alignItems: "center", justifyContent: "center" },
  countText: { ...FONT.bold, fontSize: 11, color: COLORS.primary },
  addBtn: { alignItems: "center", gap: 5, backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  addBtnText: { ...FONT.bold, fontSize: 12.5, color: "#fff" },
  addBox: { marginTop: 10, gap: 8 },
  input: { minHeight: 44, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, ...FONT.regular, fontSize: 14, lineHeight: 20 },
  addActions: { alignItems: "center", justifyContent: "flex-end", gap: 8 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  cancelText: { ...FONT.bold, fontSize: 13 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8, minWidth: 64, alignItems: "center" },
  saveText: { ...FONT.bold, fontSize: 13, color: "#fff" },
  empty: { ...FONT.regular, fontSize: 13, lineHeight: 20, marginTop: 10 },
  note: { alignItems: "flex-start", gap: 9, borderRadius: 12, borderWidth: 1, padding: 10 },
  timeChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.primary + "14", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  timeChipTappable: { marginTop: 1 },
  timeChipText: { ...FONT.bold, fontSize: 11.5, color: COLORS.primary },
  noteBody: { ...FONT.regular, fontSize: 14, lineHeight: 20 },
  noteActions: { alignItems: "center", gap: 12, paddingTop: 2 },
});
