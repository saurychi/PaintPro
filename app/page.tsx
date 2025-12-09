"use client"

import { useState, useEffect } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase/firebase.config'

export default function Home() {

  type Item = {
    id: string;
    inputText: string;
  };

  const [inputText, setInputText] = useState('');
  const [items, setItems] = useState<Item[]>([]) // use a definition(this is typescript)

  // CREATE
  const handleAddItem = async () => {
    await addDoc(collection(db, 'items'), {inputText}) // "items" is the collection name, change it
    setInputText('');
    fetchItems();
  }

  // READ
  const fetchItems = async () => {
    const snapshot = await getDocs(collection(db, 'items'))
    setItems(snapshot.docs.map((doc) => ({id: doc.id, inputText: doc.data().inputText})))
  }
  useEffect(() => {
    fetchItems()
  }, [])

  // DELETE
  const handleDelete = async (id: string) => {
    if(!id) return;
    await deleteDoc(doc(db, "items", id)); // "items" is the collection name
    fetchItems();
  }

  // UPDATE
  const handleEdit = async (id: string) => {
    const editValue = prompt("Enter the new value");
    if(!editValue) return

    // change inputText value to editValue
    await updateDoc(doc(db, "items", id), {inputText: editValue})
    fetchItems();
  }

  return (
    <div className="flex flex-col gap-2 max-w-3xl m-auto">
      <h1 className="mb-8">Sample</h1>

      <div className="flex gap-2">
        <input
          type="text"
          className="border-2 p-2"
          placeholder="Add an item..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button className="border p-2" onClick={handleAddItem}>Add</button>
      </div>

      <ul>
        {items.map((item) =>
          <li key={item.id}>{item.inputText}
            <button className='p-2 border bg-yellow-500 text-white cursor-pointer' onClick={() => handleEdit(item.id)}>Edit</button>
            <button className='p-2 border bg-red-500 text-white cursor-pointer' onClick={() => handleDelete(item.id)}>Delete</button>
          </li>)}
      </ul>

    </div>
  );
}
