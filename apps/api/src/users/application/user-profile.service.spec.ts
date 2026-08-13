import { UserProfileService } from './user-profile.service';

describe('UserProfileService', () => {
  it('normalizes username updates and never accepts arbitrary profile fields', async () => {
    const update = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn().mockResolvedValue({
      id: crypto.randomUUID(),
      email: 'fan@example.com',
      username: 'New_Name',
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    const service = new UserProfileService({
      user: { update, findUnique },
    } as never);

    await service.updateUsername(crypto.randomUUID(), '  New_Name  ');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          username: 'New_Name',
          usernameNormalized: 'new_name',
        },
      }),
    );
  });
});
