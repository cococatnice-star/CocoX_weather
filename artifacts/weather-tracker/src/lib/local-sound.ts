/** A chosen sound stays on this device. No audio bytes are uploaded. */
export interface LocalSound {
  blob: Blob;
  name: string;
}

function openSoundStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser cannot save a custom sound locally."));
      return;
    }
    const request = indexedDB.open("cocox-device-settings", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("sounds");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not open local sound storage."));
    request.onblocked = () => reject(new Error("Close other CocoX tabs to update local sound storage."));
  });
}

export async function readLocalSound(): Promise<LocalSound | null> {
  const db = await openSoundStore();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("sounds", "readonly");
    const request = transaction.objectStore("sounds").get("warning");
    let result: LocalSound | null = null;
    request.onsuccess = () => {
      const value = request.result;
      result = value?.blob instanceof Blob && typeof value.name === "string" ? value : null;
    };
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(new Error("Could not restore the custom MP3.")); };
    transaction.onabort = transaction.onerror;
  });
}

export async function writeLocalSound(sound: LocalSound | null): Promise<void> {
  const db = await openSoundStore();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("sounds", "readwrite");
    const store = transaction.objectStore("sounds");
    if (sound) store.put(sound, "warning");
    else store.delete("warning");
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(new Error("Could not save the MP3 on this device. Check browser storage permissions.")); };
    transaction.onabort = transaction.onerror;
  });
}

export async function validateMp3(file: File): Promise<void> {
  if (!/\.mp3$/i.test(file.name)) throw new Error("Choose an MP3 file (.mp3).");
  if (!file.size || file.size > 10 * 1024 * 1024) {
    throw new Error("Choose a non-empty MP3 no larger than 10 MB.");
  }
  const url = URL.createObjectURL(file);
  const audio = new Audio();
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Could not read this MP3. Try another file.")), 8000);
      audio.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        if (Number.isFinite(audio.duration) && audio.duration > 0) resolve();
        else reject(new Error("The MP3 has no playable audio."));
      };
      audio.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("This file is not a playable MP3."));
      };
      audio.preload = "metadata";
      audio.src = url;
    });
  } finally {
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
}
