import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileFormSchema, ProfileFormValues } from './settingsSchemas';
import { useSettings } from '../../store/SettingsContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Check, Info } from 'lucide-react';

export const ProfileSettingsForm: React.FC = () => {
  const { settings, updateProfile } = useSettings();
  const [saveSuccess, setSaveSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: settings.profile.name,
      email: settings.profile.email,
      role: settings.profile.role,
      workspaceName: settings.profile.workspaceName,
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    const initials = (data.name || '')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    updateProfile({
      name: data.name || '',
      email: data.email || '',
      role: data.role || '',
      workspaceName: data.workspaceName || '',
      avatarInitials: initials || 'ME',
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Editor Display Name"
          placeholder="Your name"
          {...register('name')}
          error={errors.name?.message}
        />

        <Input
          label="Email Address"
          type="email"
          placeholder="you@example.com"
          {...register('email')}
          error={errors.email?.message}
        />

        <Input
          label="Production Role"
          placeholder="Production Role (e.g. Lead Editor)"
          {...register('role')}
          error={errors.role?.message}
        />

        <Input
          label="Studio Workspace Title"
          placeholder="Your Studio / Brand"
          {...register('workspaceName')}
          error={errors.workspaceName?.message}
        />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-studio-border">
        <div className="flex items-center gap-2 text-xs text-studio-muted">
          <Info className="w-3.5 h-3.5 text-studio-subtle flex-shrink-0" />
          <span>Profile configuration is stored locally in your workstation session.</span>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!isDirty && !saveSuccess}
          leftIcon={saveSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : undefined}
        >
          {saveSuccess ? 'Profile Saved' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
};

