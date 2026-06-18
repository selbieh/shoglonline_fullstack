import factory

from apps.accounts.models import User


class UserFactory(factory.django.DjangoModelFactory):
    """Routes through the custom manager so email normalization / flags are applied."""
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    first_name = factory.Sequence(lambda n: f"مستخدم{n}")
    last_name = "تجريبي"

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        return model_class.objects.create_user(*args, **kwargs)


class StaffUserFactory(UserFactory):
    is_staff = True
    email = factory.Sequence(lambda n: f"staff{n}@example.com")


class SuperUserFactory(UserFactory):
    is_staff = True
    is_superuser = True
    email = factory.Sequence(lambda n: f"admin{n}@example.com")
