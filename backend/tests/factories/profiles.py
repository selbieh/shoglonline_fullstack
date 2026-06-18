import factory

from apps.profiles.models import EmployerProfile, WorkerProfile

from .accounts import UserFactory


class WorkerProfileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = WorkerProfile
        django_get_or_create = ("user",)

    user = factory.SubFactory(UserFactory)
    bio_title = "مطوّر برمجيات"


class EmployerProfileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = EmployerProfile
        django_get_or_create = ("user",)

    user = factory.SubFactory(UserFactory)
    company_name = "شركة تجريبية"
