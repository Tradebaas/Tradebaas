import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getBackendUrl } from '@/lib/backend-url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserGear, Key, Trash, UserCheck, UserMinus, X } from '@phosphor-icons/react';
import { toast } from 'sonner';

const BACKEND_URL = getBackendUrl();

interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export function AdminPanel() {
  const { token } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setUsers(data.users);
      } else {
        toast.error('Failed to load users');
      }
    } catch (error) {
      toast.error('Error loading users');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword || newPassword.length < 12) {
      toast.error('Wachtwoord moet minimaal 12 tekens zijn');
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Wachtwoord gereset!');
        setShowPasswordReset(false);
        setNewPassword('');
        setSelectedUser(null);
      } else {
        toast.error(data.error || 'Failed to reset password');
      }
    } catch (error) {
      toast.error('Error resetting password');
      console.error(error);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users/${user.id}/toggle-active`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`User ${data.user.is_active ? 'activated' : 'deactivated'}`);
        fetchUsers();
      } else {
        toast.error(data.error || 'Failed to toggle status');
      }
    } catch (error) {
      toast.error('Error toggling user status');
      console.error(error);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Weet je zeker dat je ${user.email} wilt verwijderen?`)) {
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        toast.success('User deleted');
        fetchUsers();
      } else {
        toast.error(data.error || 'Failed to delete user');
      }
    } catch (error) {
      toast.error('Error deleting user');
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <UserGear className="w-8 h-8 text-primary" />
        <h1 className="text-2xl font-bold">Admin Panel</h1>
      </div>

      {/* Users Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">Email</th>
                <th className="text-left p-4 font-medium">Naam</th>
                <th className="text-left p-4 font-medium">Admin</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Aangemaakt</th>
                <th className="text-left p-4 font-medium">Laatste login</th>
                <th className="text-right p-4 font-medium">Acties</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-4 font-mono text-sm">{user.email}</td>
                  <td className="p-4">{user.full_name || '-'}</td>
                  <td className="p-4">
                    {user.is_admin && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/20 text-primary rounded text-xs font-medium">
                        <UserGear className="w-3 h-3" />
                        Admin
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {user.is_active ? (
                      <span className="text-green-400">Actief</span>
                    ) : (
                      <span className="text-red-400">Inactief</span>
                    )}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString('nl-NL')}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {user.last_login ? new Date(user.last_login).toLocaleDateString('nl-NL') : 'Nooit'}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedUser(user);
                          setShowPasswordReset(true);
                        }}
                        title="Reset wachtwoord"
                      >
                        <Key className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleActive(user)}
                        title={user.is_active ? 'Deactiveer' : 'Activeer'}
                      >
                        {user.is_active ? (
                          <UserMinus className="w-4 h-4 text-orange-400" />
                        ) : (
                          <UserCheck className="w-4 h-4 text-green-400" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteUser(user)}
                        title="Verwijder user"
                      >
                        <Trash className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Reset Dialog */}
      {showPasswordReset && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Reset Wachtwoord</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowPasswordReset(false);
                  setNewPassword('');
                  setSelectedUser(null);
                }}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Nieuw wachtwoord voor <span className="font-mono text-foreground">{selectedUser.email}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nieuw wachtwoord</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Minimaal 12 tekens"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Minimaal 12 tekens voor extra veiligheid
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={() => {
                    setShowPasswordReset(false);
                    setNewPassword('');
                    setSelectedUser(null);
                  }}
                >
                  Annuleer
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleResetPassword}
                  disabled={!newPassword || newPassword.length < 12}
                >
                  Reset Wachtwoord
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
