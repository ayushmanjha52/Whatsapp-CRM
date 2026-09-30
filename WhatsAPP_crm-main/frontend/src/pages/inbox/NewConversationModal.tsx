import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus } from 'lucide-react';
import { createContact, useContacts } from '../../api';
import { Avatar, Button, Input, Modal, Segmented, Spinner } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { toast } from '../../store/toast';

export const NewConversationModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isFetching } = useContacts({ q, page_size: 8 });

  useEffect(() => {
    if (!open) {
      setQ('');
      setName('');
      setPhone('');
      setMode('existing');
    }
  }, [open]);

  const open_ = (waId: string) => {
    onClose();
    navigate(`/inbox/${waId}`);
  };

  const create = async () => {
    setSaving(true);
    try {
      const { contact } = await createContact({ name: name.trim(), phone, add_to_inbox: true });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact created');
      open_(contact.wa_id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'contact_exists') {
        open_((e.details as any).wa_id);
      } else toast.error('Could not create contact', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New conversation" description="Message an existing contact or add a new number.">
      <Segmented
        className="mb-4"
        value={mode}
        onChange={setMode}
        options={[{ value: 'existing', label: 'Existing contact' }, { value: 'new', label: 'New number' }]}
      />
      {mode === 'existing' ? (
        <div className="space-y-3">
          <Input icon={Search} placeholder="Search contacts" value={q} onChange={e => setQ(e.target.value)} />
          <div className="max-h-72 overflow-y-auto -mx-2">
            {isFetching && !data ? (
              <div className="py-6 flex justify-center"><Spinner /></div>
            ) : (data?.contacts || []).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No contacts found.</p>
            ) : (
              data!.contacts.map(c => (
                <button key={c.wa_id} onClick={() => open_(c.wa_id)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 text-left">
                  <Avatar name={c.name} src={c.avatar_url} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.phone}{c.company ? ` · ${c.company}` : ''}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Cooper" />
          <Input label="WhatsApp number" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 415 555 2671" hint="Include the country code." />
          <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
            WhatsApp requires the first message to a new contact to be an approved template. You'll be able to pick one next.
          </p>
          <div className="flex justify-end">
            <Button icon={UserPlus} onClick={create} loading={saving} disabled={!name.trim() || phone.replace(/\D/g, '').length < 8}>
              Create & open chat
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
